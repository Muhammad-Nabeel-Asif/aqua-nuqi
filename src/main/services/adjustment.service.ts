import { and, desc, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { customerAdjustments, customers } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import { assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { LedgerService } from './ledger.service'
import type { PeriodService } from './period.service'

export const ADJUSTMENT_KINDS = [
  'damaged_bottle',
  'lost_bottle',
  'dispenser_rent',
  'delivery_charge',
  'other_charge',
  'discount',
  'write_off',
  'deposit_received',
  'deposit_refunded',
] as const

export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

const DEBIT_KINDS = new Set<AdjustmentKind>([
  'damaged_bottle',
  'lost_bottle',
  'dispenser_rent',
  'delivery_charge',
  'other_charge',
])

const CREDIT_KINDS = new Set<AdjustmentKind>(['discount', 'write_off'])

const DEPOSIT_KINDS = new Set<AdjustmentKind>(['deposit_received', 'deposit_refunded'])

export type AdjustmentDto = {
  id: number
  uuid: string
  customerId: number
  adjustmentDate: string
  kind: AdjustmentKind
  amount: number
  quantity: number | null
  description: string | null
  invoiceId: number | null
  status: 'active' | 'void'
  createdAt: string
  createdBy: number | null
  /** true for deposit kinds — excluded from revenue */
  isNonRevenue: boolean
  /** sign applied on invoice: +1 debit, -1 credit */
  sign: 1 | -1
}

export type CreateAdjustmentInput = {
  customerId: number
  adjustmentDate: string
  kind: AdjustmentKind
  amount: number
  quantity?: number | null
  description?: string | null
}

function kindSign(kind: AdjustmentKind): 1 | -1 {
  if (kind === 'deposit_received' || CREDIT_KINDS.has(kind)) return -1
  return 1
}

function kindLabel(kind: AdjustmentKind): string {
  return kind.replace(/_/g, ' ')
}

export function createAdjustmentService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  balanceService: BalanceService,
  ledger: LedgerService,
) {
  function toDto(row: typeof customerAdjustments.$inferSelect): AdjustmentDto {
    const kind = row.kind as AdjustmentKind
    return {
      id: row.id,
      uuid: row.uuid,
      customerId: row.customerId,
      adjustmentDate: row.adjustmentDate,
      kind,
      amount: row.amount,
      quantity: row.quantity,
      description: row.description,
      invoiceId: row.invoiceId,
      status: row.status as 'active' | 'void',
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      isNonRevenue: DEPOSIT_KINDS.has(kind),
      sign: kindSign(kind),
    }
  }

  function getById(id: number): AdjustmentDto {
    const row = db.select().from(customerAdjustments).where(eq(customerAdjustments.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Adjustment ${id} not found`)
    return toDto(row)
  }

  function listForCustomer(
    customerId: number,
    opts: { unbilledOnly?: boolean; includeVoid?: boolean } = {},
  ): AdjustmentDto[] {
    const rows = db
      .select()
      .from(customerAdjustments)
      .where(eq(customerAdjustments.customerId, customerId))
      .orderBy(desc(customerAdjustments.adjustmentDate), desc(customerAdjustments.id))
      .all()
      .filter((r) => {
        if (!opts.includeVoid && r.status !== 'active') return false
        if (opts.unbilledOnly && r.invoiceId != null) return false
        return true
      })
    return rows.map(toDto)
  }

  /**
   * Create an adjustment. Non-deposit kinds are picked up by the next invoice (no ledger yet).
   * Deposit kinds update security_deposit_held and append a non-revenue ledger entry immediately.
   */
  function create(input: CreateAdjustmentInput, userId: number): AdjustmentDto {
    assertBusinessDate(input.adjustmentDate)
    period.guardPeriodOpen(input.adjustmentDate)

    if (!ADJUSTMENT_KINDS.includes(input.kind)) {
      throw new AppError('VALIDATION_FAILED', `Invalid adjustment kind: ${input.kind}`)
    }
    if (input.amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Adjustment amount must be positive')
    }
    if (
      (input.kind === 'damaged_bottle' || input.kind === 'lost_bottle') &&
      (input.quantity == null || input.quantity <= 0)
    ) {
      throw new AppError('VALIDATION_FAILED', 'Quantity is required for damaged/lost bottles')
    }

    const customer = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt)))
      .get()
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found')

    let createdId = 0
    db.transaction((tx) => {
      const now = nowIsoUtc()
      const row = tx
        .insert(customerAdjustments)
        .values({
          uuid: newUuid(),
          customerId: input.customerId,
          adjustmentDate: input.adjustmentDate,
          kind: input.kind,
          amount: input.amount,
          quantity: input.quantity ?? null,
          description: input.description?.trim() || kindLabel(input.kind),
          invoiceId: null,
          status: 'active',
          createdAt: now,
          createdBy: userId,
        })
        .returning()
        .get()!

      createdId = row.id

      if (input.kind === 'deposit_received') {
        tx.update(customers)
          .set({
            securityDepositHeld: customer.securityDepositHeld + input.amount,
            updatedAt: now,
            updatedBy: userId,
          })
          .where(eq(customers.id, input.customerId))
          .run()

        // Liability / customer credit — not revenue. Changes running balance.
        ledger.appendEntry(tx, {
          customerId: input.customerId,
          date: input.adjustmentDate,
          type: 'deposit_received',
          debit: 0,
          credit: input.amount,
          description: row.description ?? 'Security deposit received',
          refTable: 'customer_adjustments',
          refId: row.id,
          createdBy: userId,
        })
      } else if (input.kind === 'deposit_refunded') {
        if (customer.securityDepositHeld < input.amount) {
          throw new AppError(
            'VALIDATION_FAILED',
            `Cannot refund more than deposit held (${customer.securityDepositHeld} paisa)`,
          )
        }
        tx.update(customers)
          .set({
            securityDepositHeld: customer.securityDepositHeld - input.amount,
            updatedAt: now,
            updatedBy: userId,
          })
          .where(eq(customers.id, input.customerId))
          .run()

        ledger.appendEntry(tx, {
          customerId: input.customerId,
          date: input.adjustmentDate,
          type: 'deposit_refunded',
          debit: input.amount,
          credit: 0,
          description: row.description ?? 'Security deposit refunded',
          refTable: 'customer_adjustments',
          refId: row.id,
          createdBy: userId,
        })
      } else if (input.kind === 'damaged_bottle' || input.kind === 'lost_bottle') {
        // Bottles formula uses adjustments; refresh summary. Money waits for invoice.
        balanceService.syncFromSources(input.customerId, tx)
      }

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'customer_adjustments',
          entityId: row.id,
          summary: `Adjustment ${input.kind} ${input.amount} for customer ${customer.code}`,
          after: toDto(row),
        },
        tx,
      )
    })

    return getById(createdId)
  }

  function voidAdjustment(id: number, reason: string, userId: number): AdjustmentDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Void reason is required')
    const existing = db
      .select()
      .from(customerAdjustments)
      .where(eq(customerAdjustments.id, id))
      .get()
    if (!existing) throw new AppError('NOT_FOUND', 'Adjustment not found')
    if (existing.status === 'void') throw new AppError('CONFLICT', 'Adjustment already void')
    if (existing.invoiceId != null) {
      throw new AppError(
        'CONFLICT',
        'Adjustment is on an invoice — void or credit-note the invoice instead',
      )
    }
    period.guardPeriodOpen(existing.adjustmentDate)

    db.transaction((tx) => {
      tx.update(customerAdjustments)
        .set({ status: 'void' })
        .where(eq(customerAdjustments.id, id))
        .run()

      const kind = existing.kind as AdjustmentKind
      if (DEPOSIT_KINDS.has(kind)) {
        const customer = tx
          .select()
          .from(customers)
          .where(eq(customers.id, existing.customerId))
          .get()!
        const now = nowIsoUtc()
        if (kind === 'deposit_received') {
          tx.update(customers)
            .set({
              securityDepositHeld: Math.max(0, customer.securityDepositHeld - existing.amount),
              updatedAt: now,
              updatedBy: userId,
            })
            .where(eq(customers.id, existing.customerId))
            .run()
        } else {
          tx.update(customers)
            .set({
              securityDepositHeld: customer.securityDepositHeld + existing.amount,
              updatedAt: now,
              updatedBy: userId,
            })
            .where(eq(customers.id, existing.customerId))
            .run()
        }
        ledger.reverseEntriesFor(tx, 'customer_adjustments', id, reason, userId)
      } else if (kind === 'damaged_bottle' || kind === 'lost_bottle') {
        balanceService.syncFromSources(existing.customerId, tx)
      }

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'customer_adjustments',
          entityId: id,
          summary: `Voided adjustment ${id}: ${reason}`,
          before: toDto(existing),
        },
        tx,
      )
    })

    return getById(id)
  }

  return {
    create,
    void: voidAdjustment,
    getById,
    listForCustomer,
    DEBIT_KINDS,
    CREDIT_KINDS,
    DEPOSIT_KINDS,
    kindSign,
    toDto,
  }
}

export type AdjustmentService = ReturnType<typeof createAdjustmentService>
