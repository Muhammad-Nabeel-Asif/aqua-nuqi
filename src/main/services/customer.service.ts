import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  areas,
  auditLog,
  customerBalances,
  customerRates,
  customers,
  customerSchedules,
  deliveries,
  ledgerEntries,
  products,
  routes,
  sequences,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import {
  createCustomerInput,
  type CreateCustomerInput,
  type CustomerDto,
  type CustomerListItemDto,
  type CustomerRateDto,
  type CustomerScheduleDto,
  type ListCustomersInput,
  type UpdateCustomerInput,
} from '@shared/contracts'
import { assertBusinessDate, nowIsoUtc, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { LedgerService } from './ledger.service'
import type { PeriodService } from './period.service'
import type { RateService } from './rate.service'

const CUSTOMER_CODE_SEQ = 'customer_code'

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

function validatePhone(phone: string | null | undefined, field: string): void {
  if (!phone) return
  if (!/^[\d+\-\s()]{7,20}$/.test(phone)) {
    throw new AppError('VALIDATION_FAILED', `Invalid ${field} phone format`)
  }
}

function validateBilling(input: {
  billingMode: string
  packageAmount?: number | null
  packageIncludedQty?: number | null
  packageExcessRate?: number | null
}): void {
  if (input.billingMode === 'monthly_package') {
    if (input.packageAmount == null) {
      throw new AppError('VALIDATION_FAILED', 'Package amount is required for monthly package')
    }
    if (input.packageIncludedQty == null) {
      throw new AppError('VALIDATION_FAILED', 'Included quantity is required for monthly package')
    }
    if (input.packageExcessRate == null) {
      throw new AppError('VALIDATION_FAILED', 'Excess rate is required for monthly package')
    }
  }
}

const AR_ENTRY_TYPES = new Set([
  'invoice',
  'payment',
  'adjustment_debit',
  'adjustment_credit',
  'write_off',
])

function validateOpenings(input: {
  openingBalance?: number
  openingBottles?: number
  openingAsOf?: string | null
}): void {
  const bal = input.openingBalance ?? 0
  const bottles = input.openingBottles ?? 0
  if ((bal !== 0 || bottles !== 0) && !input.openingAsOf) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Opening as-of date is required when opening balance or bottles are non-zero',
    )
  }
  if (input.openingAsOf) assertBusinessDate(input.openingAsOf)
}

export function createCustomerService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  rateService: RateService,
  balanceService: BalanceService,
  ledgerService?: LedgerService,
) {
  function peekNextCode(): string {
    const row = db.select().from(sequences).where(eq(sequences.name, CUSTOMER_CODE_SEQ)).get()
    const next = row?.nextValue ?? 1
    return `C-${String(next).padStart(4, '0')}`
  }

  function allocateCode(tx: AppDatabase, preferred?: string): string {
    if (preferred) {
      const clash = tx
        .select()
        .from(customers)
        .where(and(eq(customers.code, preferred), isNull(customers.deletedAt)))
        .get()
      if (clash) throw new AppError('CONFLICT', `Customer code ${preferred} already exists`)
      // Advance sequence past this code if it matches C-NNNN
      const match = /^C-(\d+)$/.exec(preferred)
      if (match) {
        const n = Number(match[1]) + 1
        const seq = tx.select().from(sequences).where(eq(sequences.name, CUSTOMER_CODE_SEQ)).get()
        if (!seq) {
          tx.insert(sequences).values({ name: CUSTOMER_CODE_SEQ, nextValue: n }).run()
        } else if (seq.nextValue <= n - 1) {
          tx.update(sequences)
            .set({ nextValue: n })
            .where(eq(sequences.name, CUSTOMER_CODE_SEQ))
            .run()
        }
      }
      return preferred
    }

    const seq = tx.select().from(sequences).where(eq(sequences.name, CUSTOMER_CODE_SEQ)).get()
    let next = 1
    if (!seq) {
      tx.insert(sequences).values({ name: CUSTOMER_CODE_SEQ, nextValue: 2 }).run()
    } else {
      next = seq.nextValue
      tx.update(sequences)
        .set({ nextValue: next + 1 })
        .where(eq(sequences.name, CUSTOMER_CODE_SEQ))
        .run()
    }
    return `C-${String(next).padStart(4, '0')}`
  }

  function getSchedule(customerId: number): CustomerScheduleDto | null {
    const row = db
      .select()
      .from(customerSchedules)
      .where(and(eq(customerSchedules.customerId, customerId), isNull(customerSchedules.deletedAt)))
      .get()
    if (!row) return null
    return {
      mode: row.mode as CustomerScheduleDto['mode'],
      weekdays: row.weekdays,
      intervalDays: row.intervalDays,
      defaultQty: row.defaultQty,
    }
  }

  function upsertSchedule(
    customerId: number,
    schedule: CustomerScheduleDto | null | undefined,
    tx: AppDatabase,
  ): void {
    const existing = tx
      .select()
      .from(customerSchedules)
      .where(eq(customerSchedules.customerId, customerId))
      .get()
    if (schedule === undefined) return
    const now = nowIsoUtc()
    if (schedule === null) {
      // Soft-clear — never hard-delete schedule rows.
      if (existing && !existing.deletedAt) {
        tx.update(customerSchedules)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(customerSchedules.id, existing.id))
          .run()
      }
      return
    }
    if (existing) {
      tx.update(customerSchedules)
        .set({
          mode: schedule.mode,
          weekdays: schedule.weekdays,
          intervalDays: schedule.intervalDays,
          defaultQty: schedule.defaultQty,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(customerSchedules.id, existing.id))
        .run()
    } else {
      tx.insert(customerSchedules)
        .values({
          customerId,
          mode: schedule.mode,
          weekdays: schedule.weekdays,
          intervalDays: schedule.intervalDays,
          defaultQty: schedule.defaultQty,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run()
    }
  }

  function isLedgerVoided(entryId: number, tx: AppDatabase): boolean {
    return Boolean(
      tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.entryType, 'void_reversal'),
            eq(ledgerEntries.refTable, 'ledger_entries'),
            eq(ledgerEntries.refId, entryId),
          ),
        )
        .get(),
    )
  }

  /** Replace opening_balance rows via void_reversal + new insert — never DELETE. */
  function replaceOpeningLedger(
    customerId: number,
    openingBalance: number,
    openingAsOf: string | null,
    userId: number | null | undefined,
    tx: AppDatabase,
  ): void {
    const openingRows = tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, customerId),
          eq(ledgerEntries.entryType, 'opening_balance'),
        ),
      )
      .all()

    for (const r of openingRows) {
      if (isLedgerVoided(r.id, tx)) continue
      if (ledgerService) {
        ledgerService.appendEntry(tx, {
          customerId,
          date: r.entryDate,
          type: 'void_reversal',
          debit: r.credit,
          credit: r.debit,
          description: `Void: ${r.description}`,
          refTable: 'ledger_entries',
          refId: r.id,
          createdBy: userId,
        })
      } else {
        const afterVoid = balanceService.computeLiveBalance(customerId, tx) - r.debit + r.credit
        tx.insert(ledgerEntries)
          .values({
            uuid: newUuid(),
            customerId: r.customerId,
            entryDate: r.entryDate,
            entryType: 'void_reversal',
            debit: r.credit,
            credit: r.debit,
            balanceAfter: afterVoid,
            description: `Void: ${r.description}`,
            refTable: 'ledger_entries',
            refId: r.id,
            createdAt: nowIsoUtc(),
            createdBy: userId ?? null,
          })
          .run()
      }
    }

    if (openingBalance !== 0 && openingAsOf) {
      period.guardPeriodOpen(openingAsOf)
      const debit = openingBalance > 0 ? openingBalance : 0
      const credit = openingBalance < 0 ? -openingBalance : 0
      if (ledgerService) {
        ledgerService.appendEntry(tx, {
          customerId,
          date: openingAsOf,
          type: 'opening_balance',
          debit,
          credit,
          description: 'Opening balance',
          refTable: 'customers',
          refId: customerId,
          createdBy: userId,
        })
      } else {
        tx.insert(ledgerEntries)
          .values({
            uuid: newUuid(),
            customerId,
            entryDate: openingAsOf,
            entryType: 'opening_balance',
            debit,
            credit,
            balanceAfter: openingBalance,
            description: 'Opening balance',
            refTable: 'customers',
            refId: customerId,
            createdAt: nowIsoUtc(),
            createdBy: userId ?? null,
          })
          .run()
      }
    }
  }

  /**
   * Keep deposit_received ledger in sync with security_deposit_held.
   * Deposit credits change the running account; they are tagged non-revenue (FR-BL-14).
   */
  function syncDepositLedger(
    customerId: number,
    depositHeld: number,
    asOf: string,
    userId: number | null | undefined,
    tx: AppDatabase,
  ): void {
    const depositRows = tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, customerId),
          eq(ledgerEntries.entryType, 'deposit_received'),
        ),
      )
      .all()

    for (const r of depositRows) {
      if (isLedgerVoided(r.id, tx)) continue
      if (ledgerService) {
        ledgerService.appendEntry(tx, {
          customerId,
          date: r.entryDate,
          type: 'void_reversal',
          debit: r.credit,
          credit: r.debit,
          description: `Void: ${r.description}`,
          refTable: 'ledger_entries',
          refId: r.id,
          createdBy: userId,
        })
      } else {
        const bal = balanceService.computeLiveBalance(customerId, tx)
        tx.insert(ledgerEntries)
          .values({
            uuid: newUuid(),
            customerId,
            entryDate: r.entryDate,
            entryType: 'void_reversal',
            debit: r.credit,
            credit: r.debit,
            balanceAfter: bal - r.credit + r.debit,
            description: `Void: ${r.description}`,
            refTable: 'ledger_entries',
            refId: r.id,
            createdAt: nowIsoUtc(),
            createdBy: userId ?? null,
          })
          .run()
      }
    }

    if (depositHeld > 0) {
      if (ledgerService) {
        ledgerService.appendEntry(tx, {
          customerId,
          date: asOf,
          type: 'deposit_received',
          debit: 0,
          credit: depositHeld,
          description: 'Security deposit received',
          refTable: 'customers',
          refId: customerId,
          createdBy: userId,
        })
      } else {
        const bal = balanceService.computeLiveBalance(customerId, tx)
        tx.insert(ledgerEntries)
          .values({
            uuid: newUuid(),
            customerId,
            entryDate: asOf,
            entryType: 'deposit_received',
            debit: 0,
            credit: depositHeld,
            balanceAfter: bal - depositHeld,
            description: 'Security deposit received',
            refTable: 'customers',
            refId: customerId,
            createdAt: nowIsoUtc(),
            createdBy: userId ?? null,
          })
          .run()
      }
    }
  }

  function toDto(row: typeof customers.$inferSelect): CustomerDto {
    const area = row.areaId ? db.select().from(areas).where(eq(areas.id, row.areaId)).get() : null
    const route = row.routeId
      ? db.select().from(routes).where(eq(routes.id, row.routeId)).get()
      : null
    const bal = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, row.id))
      .get()

    let currentRate: number | null = null
    try {
      const productId = rateService.resolveDefaultProductId()
      currentRate = rateService.getRateFor(row.id, productId, todayBusinessDate())
    } catch {
      currentRate = null
    }

    return {
      id: row.id,
      uuid: row.uuid,
      code: row.code,
      name: row.name,
      customerType: row.customerType as CustomerDto['customerType'],
      phonePrimary: row.phonePrimary,
      phoneSecondary: row.phoneSecondary,
      whatsappNumber: row.whatsappNumber,
      email: row.email,
      addressLine: row.addressLine,
      landmark: row.landmark,
      areaId: row.areaId,
      areaName: area?.name ?? null,
      routeId: row.routeId,
      routeName: route?.name ?? null,
      deliveryNotes: row.deliveryNotes,
      billingMode: row.billingMode as CustomerDto['billingMode'],
      packageAmount: row.packageAmount,
      packageIncludedQty: row.packageIncludedQty,
      packageExcessRate: row.packageExcessRate,
      billingDay: row.billingDay,
      creditLimit: row.creditLimit,
      securityDepositHeld: row.securityDepositHeld,
      openingBottles: row.openingBottles,
      openingBalance: row.openingBalance,
      openingAsOf: row.openingAsOf,
      status: row.status as CustomerDto['status'],
      pausedFrom: row.pausedFrom,
      pausedTo: row.pausedTo,
      statusReason: row.statusReason,
      joinedOn: row.joinedOn,
      notes: row.notes,
      balance: bal?.balance ?? 0,
      bottlesWithCustomer: bal?.bottlesWithCustomer ?? row.openingBottles,
      currentRate,
      schedule: getSchedule(row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function hasTransactions(customerId: number): boolean {
    // Openings, deposits, and their void_reversals do not lock further opening edits.
    const rows = db
      .select({ entryType: ledgerEntries.entryType })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, customerId))
      .all()
    if (rows.some((r) => AR_ENTRY_TYPES.has(r.entryType))) return true
    const d = db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.customerId, customerId))
      .limit(1)
      .get()
    return Boolean(d)
  }

  function create(rawInput: CreateCustomerInput, userId?: number | null): CustomerDto {
    const parsed = createCustomerInput.safeParse(rawInput)
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Invalid customer', parsed.error.flatten())
    }
    const input = parsed.data

    validatePhone(input.phonePrimary, 'primary')
    validatePhone(input.phoneSecondary, 'secondary')
    validatePhone(input.whatsappNumber, 'WhatsApp')
    validateBilling(input)
    validateOpenings({
      openingBalance: input.openingBalance,
      openingBottles: input.openingBottles,
      openingAsOf: input.openingAsOf,
    })

    const openingBalance = input.openingBalance ?? 0
    const openingBottles = input.openingBottles ?? 0
    const openingAsOf = input.openingAsOf ?? null

    if (openingAsOf) {
      period.guardPeriodOpen(openingAsOf)
    }

    const now = nowIsoUtc()
    let createdId = 0

    db.transaction((tx) => {
      const code = allocateCode(tx, input.code?.trim())
      const whatsapp = emptyToNull(input.whatsappNumber) ?? emptyToNull(input.phonePrimary)

      const row = tx
        .insert(customers)
        .values({
          uuid: newUuid(),
          code,
          name: input.name.trim(),
          customerType: input.customerType,
          phonePrimary: emptyToNull(input.phonePrimary),
          phoneSecondary: emptyToNull(input.phoneSecondary),
          whatsappNumber: whatsapp,
          email: emptyToNull(input.email),
          addressLine: emptyToNull(input.addressLine),
          landmark: emptyToNull(input.landmark),
          areaId: input.areaId ?? null,
          routeId: input.routeId ?? null,
          deliveryNotes: emptyToNull(input.deliveryNotes),
          billingMode: input.billingMode,
          packageAmount: input.packageAmount ?? null,
          packageIncludedQty: input.packageIncludedQty ?? null,
          packageExcessRate: input.packageExcessRate ?? null,
          billingDay: input.billingDay ?? null,
          creditLimit: input.creditLimit ?? null,
          securityDepositHeld: input.securityDepositHeld ?? 0,
          openingBottles,
          openingBalance,
          openingAsOf,
          status: input.status ?? 'active',
          pausedFrom: input.pausedFrom ?? null,
          pausedTo: input.pausedTo ?? null,
          statusReason: emptyToNull(input.statusReason),
          joinedOn: input.joinedOn ?? todayBusinessDate(),
          notes: emptyToNull(input.notes),
          createdAt: now,
          updatedAt: now,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        })
        .returning()
        .get()

      createdId = row.id
      upsertSchedule(row.id, input.schedule, tx)

      if (openingBalance !== 0 && openingAsOf) {
        const debit = openingBalance > 0 ? openingBalance : 0
        const credit = openingBalance < 0 ? -openingBalance : 0
        if (ledgerService) {
          ledgerService.appendEntry(tx, {
            customerId: row.id,
            date: openingAsOf,
            type: 'opening_balance',
            debit,
            credit,
            description: 'Opening balance',
            refTable: 'customers',
            refId: row.id,
            createdBy: userId,
          })
        } else {
          tx.insert(ledgerEntries)
            .values({
              uuid: newUuid(),
              customerId: row.id,
              entryDate: openingAsOf,
              entryType: 'opening_balance',
              debit,
              credit,
              balanceAfter: openingBalance,
              description: 'Opening balance',
              refTable: 'customers',
              refId: row.id,
              createdAt: now,
              createdBy: userId ?? null,
            })
            .run()
        }
      }

      const depositHeld = input.securityDepositHeld ?? 0
      if (depositHeld > 0) {
        const depositDate = openingAsOf ?? input.joinedOn ?? todayBusinessDate()
        syncDepositLedger(row.id, depositHeld, depositDate, userId, tx)
      }

      balanceService.syncFromSources(row.id, tx)

      if (input.rate != null) {
        const productId = input.productId ?? rateService.resolveDefaultProductId()
        const from = openingAsOf ?? input.joinedOn ?? todayBusinessDate()
        tx.insert(customerRates)
          .values({
            uuid: newUuid(),
            customerId: row.id,
            productId,
            rate: input.rate,
            effectiveFrom: from,
            effectiveTo: null,
            reason: 'Initial rate',
            createdAt: now,
            createdBy: userId ?? null,
          })
          .run()
      }

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'customers',
          entityId: row.id,
          summary: `Created customer ${code} — ${row.name}`,
          after: toDto(row),
        },
        tx,
      )
    })

    return getById(createdId)
  }

  function getById(id: number): CustomerDto {
    const row = db.select().from(customers).where(eq(customers.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'Customer not found')
    return toDto(row)
  }

  function getWithHistory(id: number): {
    item: CustomerDto
    rateHistory: CustomerRateDto[]
    openingsEditable: boolean
  } {
    return {
      item: getById(id),
      rateHistory: rateService.listHistory(id),
      openingsEditable: !hasTransactions(id),
    }
  }

  function update(input: UpdateCustomerInput, userId?: number | null): CustomerDto {
    const existing = db.select().from(customers).where(eq(customers.id, input.id)).get()
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Customer not found')

    if (input.phonePrimary !== undefined) validatePhone(input.phonePrimary, 'primary')
    if (input.phoneSecondary !== undefined) validatePhone(input.phoneSecondary, 'secondary')
    if (input.whatsappNumber !== undefined) validatePhone(input.whatsappNumber, 'WhatsApp')

    const billingMode = input.billingMode ?? existing.billingMode
    validateBilling({
      billingMode,
      packageAmount:
        input.packageAmount !== undefined ? input.packageAmount : existing.packageAmount,
      packageIncludedQty:
        input.packageIncludedQty !== undefined
          ? input.packageIncludedQty
          : existing.packageIncludedQty,
      packageExcessRate:
        input.packageExcessRate !== undefined
          ? input.packageExcessRate
          : existing.packageExcessRate,
    })

    const openingsEditable = !hasTransactions(existing.id)
    if (
      !openingsEditable &&
      (input.openingBalance !== undefined ||
        input.openingBottles !== undefined ||
        input.openingAsOf !== undefined ||
        input.securityDepositHeld !== undefined)
    ) {
      throw new AppError(
        'CONFLICT',
        'Opening balances can only be edited before the customer has transactions',
      )
    }

    if (openingsEditable) {
      validateOpenings({
        openingBalance:
          input.openingBalance !== undefined ? input.openingBalance : existing.openingBalance,
        openingBottles:
          input.openingBottles !== undefined ? input.openingBottles : existing.openingBottles,
        openingAsOf: input.openingAsOf !== undefined ? input.openingAsOf : existing.openingAsOf,
      })
    }

    if (input.code && input.code !== existing.code) {
      const clash = db
        .select()
        .from(customers)
        .where(and(eq(customers.code, input.code), isNull(customers.deletedAt)))
        .get()
      if (clash) throw new AppError('CONFLICT', `Customer code ${input.code} already exists`)
    }

    const before = toDto(existing)

    db.transaction((tx) => {
      const nextOpeningBalance =
        input.openingBalance !== undefined ? input.openingBalance : existing.openingBalance
      const nextOpeningBottles =
        input.openingBottles !== undefined ? input.openingBottles : existing.openingBottles
      const nextOpeningAsOf =
        input.openingAsOf !== undefined ? input.openingAsOf : existing.openingAsOf

      tx.update(customers)
        .set({
          name: input.name?.trim() ?? existing.name,
          code: input.code?.trim() ?? existing.code,
          customerType: input.customerType ?? existing.customerType,
          phonePrimary:
            input.phonePrimary !== undefined
              ? emptyToNull(input.phonePrimary)
              : existing.phonePrimary,
          phoneSecondary:
            input.phoneSecondary !== undefined
              ? emptyToNull(input.phoneSecondary)
              : existing.phoneSecondary,
          whatsappNumber:
            input.whatsappNumber !== undefined
              ? emptyToNull(input.whatsappNumber)
              : existing.whatsappNumber,
          email: input.email !== undefined ? emptyToNull(input.email) : existing.email,
          addressLine:
            input.addressLine !== undefined ? emptyToNull(input.addressLine) : existing.addressLine,
          landmark: input.landmark !== undefined ? emptyToNull(input.landmark) : existing.landmark,
          areaId: input.areaId !== undefined ? input.areaId : existing.areaId,
          routeId: input.routeId !== undefined ? input.routeId : existing.routeId,
          deliveryNotes:
            input.deliveryNotes !== undefined
              ? emptyToNull(input.deliveryNotes)
              : existing.deliveryNotes,
          billingMode,
          packageAmount:
            input.packageAmount !== undefined ? input.packageAmount : existing.packageAmount,
          packageIncludedQty:
            input.packageIncludedQty !== undefined
              ? input.packageIncludedQty
              : existing.packageIncludedQty,
          packageExcessRate:
            input.packageExcessRate !== undefined
              ? input.packageExcessRate
              : existing.packageExcessRate,
          billingDay: input.billingDay !== undefined ? input.billingDay : existing.billingDay,
          creditLimit: input.creditLimit !== undefined ? input.creditLimit : existing.creditLimit,
          securityDepositHeld:
            input.securityDepositHeld !== undefined
              ? input.securityDepositHeld
              : existing.securityDepositHeld,
          openingBottles: nextOpeningBottles,
          openingBalance: nextOpeningBalance,
          openingAsOf: nextOpeningAsOf,
          status: input.status ?? existing.status,
          pausedFrom: input.pausedFrom !== undefined ? input.pausedFrom : existing.pausedFrom,
          pausedTo: input.pausedTo !== undefined ? input.pausedTo : existing.pausedTo,
          statusReason:
            input.statusReason !== undefined
              ? emptyToNull(input.statusReason)
              : existing.statusReason,
          joinedOn: input.joinedOn !== undefined ? input.joinedOn : existing.joinedOn,
          notes: input.notes !== undefined ? emptyToNull(input.notes) : existing.notes,
          updatedAt: nowIsoUtc(),
          updatedBy: userId ?? null,
        })
        .where(eq(customers.id, existing.id))
        .run()

      upsertSchedule(existing.id, input.schedule, tx)

      if (openingsEditable) {
        const openingsChanged =
          input.openingBalance !== undefined ||
          input.openingBottles !== undefined ||
          input.openingAsOf !== undefined
        const depositChanged = input.securityDepositHeld !== undefined

        if (openingsChanged) {
          replaceOpeningLedger(existing.id, nextOpeningBalance, nextOpeningAsOf, userId, tx)
        }

        if (depositChanged) {
          const nextDeposit =
            input.securityDepositHeld !== undefined
              ? input.securityDepositHeld
              : existing.securityDepositHeld
          const depositDate = nextOpeningAsOf ?? existing.joinedOn ?? todayBusinessDate()
          syncDepositLedger(existing.id, nextDeposit, depositDate, userId, tx)
        }

        if (openingsChanged || depositChanged) {
          balanceService.syncFromSources(existing.id, tx)
        }
      }

      const updatedRow = tx.select().from(customers).where(eq(customers.id, existing.id)).get()!
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'customers',
          entityId: existing.id,
          summary: `Updated customer ${existing.code}`,
          before,
          after: toDto(updatedRow),
        },
        tx,
      )
    })

    return getById(existing.id)
  }

  function setStatus(
    input: {
      id: number
      status: CustomerDto['status']
      reason?: string
      pausedFrom?: string | null
      pausedTo?: string | null
    },
    userId?: number | null,
  ): CustomerDto {
    const existing = db.select().from(customers).where(eq(customers.id, input.id)).get()
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Customer not found')

    if (input.status === 'inactive' && !input.reason?.trim()) {
      throw new AppError('VALIDATION_FAILED', 'A reason is required when deactivating a customer')
    }

    const bal = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, existing.id))
      .get()

    const before = toDto(existing)
    db.transaction((tx) => {
      tx.update(customers)
        .set({
          status: input.status,
          statusReason: input.reason?.trim() ?? existing.statusReason,
          pausedFrom: input.pausedFrom !== undefined ? input.pausedFrom : existing.pausedFrom,
          pausedTo: input.pausedTo !== undefined ? input.pausedTo : existing.pausedTo,
          updatedAt: nowIsoUtc(),
          updatedBy: userId ?? null,
        })
        .where(eq(customers.id, existing.id))
        .run()

      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'customers',
          entityId: existing.id,
          summary: `Set customer ${existing.code} status to ${input.status}${
            input.reason ? `: ${input.reason}` : ''
          }${
            input.status === 'inactive' &&
            ((bal?.balance ?? 0) !== 0 || (bal?.bottlesWithCustomer ?? 0) > 0)
              ? ` (had balance ${bal?.balance ?? 0}, bottles ${bal?.bottlesWithCustomer ?? 0})`
              : ''
          }`,
          before,
          after: { status: input.status, reason: input.reason },
        },
        tx,
      )
    })

    return getById(existing.id)
  }

  function list(input: ListCustomersInput): { items: CustomerListItemDto[]; total: number } {
    // Single join query + one rates batch — no per-row toDto (NFR-02).
    const joined = db
      .select({
        id: customers.id,
        uuid: customers.uuid,
        code: customers.code,
        name: customers.name,
        customerType: customers.customerType,
        phonePrimary: customers.phonePrimary,
        phoneSecondary: customers.phoneSecondary,
        whatsappNumber: customers.whatsappNumber,
        addressLine: customers.addressLine,
        landmark: customers.landmark,
        areaId: customers.areaId,
        areaName: areas.name,
        routeId: customers.routeId,
        routeName: routes.name,
        status: customers.status,
        billingMode: customers.billingMode,
        openingBottles: customers.openingBottles,
        balance: customerBalances.balance,
        bottlesWithCustomer: customerBalances.bottlesWithCustomer,
      })
      .from(customers)
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .leftJoin(customerBalances, eq(customers.id, customerBalances.customerId))
      .where(isNull(customers.deletedAt))
      .all()

    const today = todayBusinessDate()
    let productId: number | null = null
    let defaultRate = 0
    try {
      productId = rateService.resolveDefaultProductId()
      const product = db.select().from(products).where(eq(products.id, productId)).get()
      defaultRate = product?.defaultRate ?? 0
    } catch {
      productId = null
    }

    const rateByCustomer = new Map<number, number>()
    if (productId != null) {
      const openRates = db
        .select()
        .from(customerRates)
        .where(
          and(
            eq(customerRates.productId, productId),
            lte(customerRates.effectiveFrom, today),
            or(isNull(customerRates.effectiveTo), gte(customerRates.effectiveTo, today)),
          ),
        )
        .orderBy(desc(customerRates.effectiveFrom))
        .all()
      for (const r of openRates) {
        if (!rateByCustomer.has(r.customerId)) rateByCustomer.set(r.customerId, r.rate)
      }
    }

    const needle = input.search?.trim().toLowerCase()
    type ListRow = {
      id: number
      uuid: string
      code: string
      name: string
      customerType: CustomerListItemDto['customerType']
      phonePrimary: string | null
      areaId: number | null
      areaName: string | null
      routeId: number | null
      routeName: string | null
      status: CustomerListItemDto['status']
      billingMode: CustomerListItemDto['billingMode']
      balance: number
      bottlesWithCustomer: number
      currentRate: number | null
    }

    const filtered: ListRow[] = joined
      .map((c) => {
        const balance = c.balance ?? 0
        const bottles = c.bottlesWithCustomer ?? c.openingBottles
        return {
          id: c.id,
          uuid: c.uuid,
          code: c.code,
          name: c.name,
          customerType: c.customerType as CustomerListItemDto['customerType'],
          phonePrimary: c.phonePrimary,
          areaId: c.areaId,
          areaName: c.areaName ?? null,
          routeId: c.routeId,
          routeName: c.routeName ?? null,
          status: c.status as CustomerListItemDto['status'],
          billingMode: c.billingMode as CustomerListItemDto['billingMode'],
          balance,
          bottlesWithCustomer: bottles,
          currentRate: rateByCustomer.get(c.id) ?? (productId != null ? defaultRate : null),
          _searchHay: [
            c.name,
            c.code,
            c.phonePrimary,
            c.phoneSecondary,
            c.whatsappNumber,
            c.addressLine,
            c.landmark,
            c.areaName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        }
      })
      .filter((c) => {
        if (input.areaId && c.areaId !== input.areaId) return false
        if (input.routeId && c.routeId !== input.routeId) return false
        if (input.status && c.status !== input.status) return false
        if (input.customerType && c.customerType !== input.customerType) return false
        if (input.hasOutstanding && !(c.balance > 0)) return false
        if (input.holdsBottles && !(c.bottlesWithCustomer > 0)) return false
        if (needle && !c._searchHay.includes(needle)) return false
        return true
      })
      .map(({ _searchHay: _, ...rest }) => rest)

    const sortBy = input.sortBy ?? 'name'
    const dir = input.sortDir === 'desc' ? -1 : 1
    filtered.sort((a, b) => {
      const av =
        sortBy === 'code'
          ? a.code
          : sortBy === 'name'
            ? a.name
            : sortBy === 'phone'
              ? (a.phonePrimary ?? '')
              : sortBy === 'area'
                ? (a.areaName ?? '')
                : sortBy === 'route'
                  ? (a.routeName ?? '')
                  : sortBy === 'rate'
                    ? (a.currentRate ?? 0)
                    : sortBy === 'bottles'
                      ? a.bottlesWithCustomer
                      : sortBy === 'balance'
                        ? a.balance
                        : a.status
      const bv =
        sortBy === 'code'
          ? b.code
          : sortBy === 'name'
            ? b.name
            : sortBy === 'phone'
              ? (b.phonePrimary ?? '')
              : sortBy === 'area'
                ? (b.areaName ?? '')
                : sortBy === 'route'
                  ? (b.routeName ?? '')
                  : sortBy === 'rate'
                    ? (b.currentRate ?? 0)
                    : sortBy === 'bottles'
                      ? b.bottlesWithCustomer
                      : sortBy === 'balance'
                        ? b.balance
                        : b.status
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })

    const total = filtered.length
    const offset = input.offset ?? 0
    const limit = input.limit ?? 1000
    const page = filtered.slice(offset, offset + limit)
    return { items: page, total }
  }

  function search(query: string, limit = 20) {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    const rows = db.select().from(customers).where(isNull(customers.deletedAt)).all()
    return rows
      .filter((c) => {
        const hay = [c.name, c.code, c.phonePrimary, c.phoneSecondary, c.addressLine]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        phonePrimary: c.phonePrimary,
        addressLine: c.addressLine,
      }))
  }

  function bulkUpdate(
    input: {
      ids: number[]
      areaId?: number | null
      routeId?: number | null
      status?: CustomerDto['status']
    },
    userId?: number | null,
  ): { updated: number } {
    let updated = 0
    db.transaction((tx) => {
      for (const id of input.ids) {
        const existing = tx.select().from(customers).where(eq(customers.id, id)).get()
        if (!existing || existing.deletedAt) continue
        const before = {
          id: existing.id,
          code: existing.code,
          areaId: existing.areaId,
          routeId: existing.routeId,
          status: existing.status,
        }
        const next = {
          areaId: input.areaId !== undefined ? input.areaId : existing.areaId,
          routeId: input.routeId !== undefined ? input.routeId : existing.routeId,
          status: input.status ?? existing.status,
        }
        tx.update(customers)
          .set({
            ...next,
            updatedAt: nowIsoUtc(),
            updatedBy: userId ?? null,
          })
          .where(eq(customers.id, id))
          .run()
        audit.record(
          {
            userId,
            action: 'update',
            entityTable: 'customers',
            entityId: id,
            summary: `Bulk updated customer ${existing.code}`,
            before,
            after: { id, code: existing.code, ...next },
          },
          tx,
        )
        updated += 1
      }
    })
    return { updated }
  }

  function listAudit(customerId: number, limit = 50) {
    const rows = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityTable, 'customers'), eq(auditLog.entityId, customerId)))
      .all()
    // Also include rate audits for this customer
    const rateIds = db
      .select({ id: customerRates.id })
      .from(customerRates)
      .where(eq(customerRates.customerId, customerId))
      .all()
      .map((r) => r.id)
    const rateAudits =
      rateIds.length === 0
        ? []
        : db
            .select()
            .from(auditLog)
            .where(eq(auditLog.entityTable, 'customer_rates'))
            .all()
            .filter((a) => a.entityId != null && rateIds.includes(a.entityId))

    const merged = [...rows, ...rateAudits].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    return merged.slice(0, limit).map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      action: r.action,
      summary: r.summary,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
    }))
  }

  function previewBulkRate(input: {
    areaId?: number
    routeId?: number
    customerType?: string
    currentRate?: number
    productId?: number
  }) {
    const productId = rateService.resolveDefaultProductId(input.productId)
    const rows = db
      .select()
      .from(customers)
      .where(and(isNull(customers.deletedAt), eq(customers.status, 'active')))
      .all()
    const today = todayBusinessDate()
    return rows
      .filter((c) => {
        if (input.areaId && c.areaId !== input.areaId) return false
        if (input.routeId && c.routeId !== input.routeId) return false
        if (input.customerType && c.customerType !== input.customerType) return false
        const rate = rateService.getRateFor(c.id, productId, today)
        if (input.currentRate != null && rate !== input.currentRate) return false
        return true
      })
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        oldRate: rateService.getRateFor(c.id, productId, today),
      }))
  }

  function exportRows(
    format: 'csv' | 'xlsx',
    userId?: number | null,
  ): {
    fileName: string
    mimeType: string
    base64: string
  } {
    const { items } = list({ limit: 5000, sortBy: 'code', sortDir: 'asc' })
    const headers = [
      'code',
      'name',
      'type',
      'phone',
      'area',
      'route',
      'rate',
      'balance',
      'bottles',
      'status',
      'address',
    ]
    const data = items.map((c) => [
      c.code,
      c.name,
      c.customerType,
      c.phonePrimary ?? '',
      c.areaName ?? '',
      c.routeName ?? '',
      c.currentRate != null ? (c.currentRate / 100).toFixed(2) : '',
      (c.balance / 100).toFixed(2),
      String(c.bottlesWithCustomer),
      c.status,
      '',
    ])

    let result: { fileName: string; mimeType: string; base64: string }
    if (format === 'csv') {
      const lines = [headers.join(','), ...data.map((r) => r.map(csvEscape).join(','))]
      const base64 = Buffer.from(lines.join('\n'), 'utf8').toString('base64')
      result = {
        fileName: `customers-${todayBusinessDate()}.csv`,
        mimeType: 'text/csv',
        base64,
      }
    } else {
      // Lazy require to keep service free of Electron; xlsx is a plain dep.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as typeof import('xlsx')
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...data])
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, sheet, 'Customers')
      const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      result = {
        fileName: `customers-${todayBusinessDate()}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: buf.toString('base64'),
      }
    }

    audit.record({
      userId,
      action: 'export',
      entityTable: 'customers',
      summary: `Exported ${items.length} customers as ${format.toUpperCase()}`,
      after: { format, count: items.length, fileName: result.fileName },
    })

    return result
  }

  return {
    peekNextCode,
    create,
    getById,
    getWithHistory,
    update,
    setStatus,
    list,
    search,
    bulkUpdate,
    listAudit,
    previewBulkRate,
    exportRows,
    hasTransactions,
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export type CustomerService = ReturnType<typeof createCustomerService>
