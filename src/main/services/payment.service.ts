import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  customers,
  deliveries,
  invoices,
  paymentAllocations,
  payments,
  sequences,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import { assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { BillingService } from './billing.service'
import type { LedgerService } from './ledger.service'
import type { PeriodService } from './period.service'

export type PaymentMethod =
  'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'cheque' | 'online' | 'other'

export type PaymentPurpose = 'payment' | 'deposit'

export type PaymentAllocationDto = {
  id: number
  paymentId: number
  invoiceId: number
  invoiceNo: string
  amount: number
  status: 'active' | 'superseded' | 'void'
}

export type PaymentDto = {
  id: number
  uuid: string
  receiptNo: string | null
  customerId: number
  customerCode: string
  customerName: string
  paymentDate: string
  amount: number
  method: PaymentMethod
  purpose: PaymentPurpose
  referenceNo: string | null
  receivedByEmployeeId: number | null
  notes: string | null
  status: 'active' | 'void'
  voidReason: string | null
  createdAt: string
  createdBy: number | null
  allocations: PaymentAllocationDto[]
  unallocated: number
}

export type RecordPaymentInput = {
  customerId: number
  date: string
  amount: number
  method: PaymentMethod
  /** deposit = security deposit liability; excluded from cash revenue / collection reports. */
  purpose?: PaymentPurpose
  referenceNo?: string | null
  receivedByEmployeeId?: number | null
  notes?: string | null
  /** Manual allocations; if omitted, FIFO to oldest unpaid issued invoices */
  allocations?: Array<{ invoiceId: number; amount: number }>
}

/** Notes that mention deposit without purpose=deposit are rejected. */
function notesImplyDeposit(notes: string | null | undefined): boolean {
  if (!notes) return false
  return /\bdeposit\b/i.test(notes)
}

function normalizeDepositNotes(notes: string | null | undefined): string {
  const trimmed = (notes ?? '').trim()
  if (trimmed.startsWith('[deposit]')) return trimmed
  return trimmed ? `[deposit] ${trimmed}` : '[deposit]'
}

export function createPaymentService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  balanceService: BalanceService,
  ledger: LedgerService,
  billing: BillingService,
) {
  function allocateReceiptNo(tx: AppDatabase): string {
    const seqName = 'receipt'
    const row = tx.select().from(sequences).where(eq(sequences.name, seqName)).get()
    let next = 1
    if (!row) {
      tx.insert(sequences).values({ name: seqName, nextValue: 2 }).run()
    } else {
      next = row.nextValue
      tx.update(sequences)
        .set({ nextValue: next + 1 })
        .where(eq(sequences.name, seqName))
        .run()
    }
    return `RCV-${String(next).padStart(5, '0')}`
  }

  function toDto(row: typeof payments.$inferSelect): PaymentDto {
    const customer = db.select().from(customers).where(eq(customers.id, row.customerId)).get()
    const allocs = db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, row.id))
      .all()
    const allocations: PaymentAllocationDto[] = allocs.map((a) => {
      const inv = db.select().from(invoices).where(eq(invoices.id, a.invoiceId)).get()
      return {
        id: a.id,
        paymentId: a.paymentId,
        invoiceId: a.invoiceId,
        invoiceNo: inv?.invoiceNo ?? '',
        amount: a.amount,
        status: (a.status as PaymentAllocationDto['status']) ?? 'active',
      }
    })
    const allocated = allocations
      .filter((a) => a.status === 'active')
      .reduce((s, a) => s + a.amount, 0)
    return {
      id: row.id,
      uuid: row.uuid,
      receiptNo: row.receiptNo,
      customerId: row.customerId,
      customerCode: customer?.code ?? '',
      customerName: customer?.name ?? '',
      paymentDate: row.paymentDate,
      amount: row.amount,
      method: row.method as PaymentMethod,
      purpose: (row.purpose === 'deposit' ? 'deposit' : 'payment') as PaymentPurpose,
      referenceNo: row.referenceNo,
      receivedByEmployeeId: row.receivedByEmployeeId,
      notes: row.notes,
      status: row.status as 'active' | 'void',
      voidReason: row.voidReason,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      allocations,
      unallocated: row.amount - allocated,
    }
  }

  function getById(id: number): PaymentDto {
    const row = db.select().from(payments).where(eq(payments.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Payment ${id} not found`)
    return toDto(row)
  }

  function unpaidInvoicesFifo(customerId: number, tx: AppDatabase = db) {
    return tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, customerId),
          sql`${invoices.status} IN ('issued','partially_paid')`,
        ),
      )
      .orderBy(asc(invoices.issueDate), asc(invoices.id))
      .all()
      .map((inv) => ({
        ...inv,
        due: inv.totalPayable - inv.paidTotal,
      }))
      .filter((inv) => inv.due > 0)
  }

  function recordPayment(input: RecordPaymentInput, userId: number): PaymentDto {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    if (input.amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Payment amount must be positive')
    }
    const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get()
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found')

    const purpose: PaymentPurpose = input.purpose === 'deposit' ? 'deposit' : 'payment'
    if (purpose === 'payment' && notesImplyDeposit(input.notes)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Notes mention a deposit — set purpose to "deposit" (security deposits are liabilities, not revenue)',
      )
    }
    const notes = purpose === 'deposit' ? normalizeDepositNotes(input.notes) : (input.notes ?? null)

    let paymentId = 0
    db.transaction((tx) => {
      const receiptNo = allocateReceiptNo(tx)
      const now = nowIsoUtc()
      const row = tx
        .insert(payments)
        .values({
          uuid: newUuid(),
          receiptNo,
          customerId: input.customerId,
          paymentDate: input.date,
          amount: input.amount,
          method: input.method,
          purpose,
          referenceNo: input.referenceNo ?? null,
          receivedByEmployeeId: input.receivedByEmployeeId ?? null,
          notes,
          status: 'active',
          createdAt: now,
          createdBy: userId,
        })
        .returning()
        .get()!
      paymentId = row.id

      ledger.appendEntry(tx, {
        customerId: input.customerId,
        date: input.date,
        type: 'payment',
        debit: 0,
        credit: input.amount,
        description: purpose === 'deposit' ? `Deposit ${receiptNo}` : `Payment ${receiptNo}`,
        refTable: 'payments',
        refId: row.id,
        createdBy: userId,
      })

      let remaining = input.amount
      const plan: Array<{ invoiceId: number; amount: number }> = []

      // Deposit receipts are liabilities — do not allocate to invoices.
      if (purpose === 'payment') {
        if (input.allocations?.length) {
          for (const a of input.allocations) {
            if (a.amount <= 0) continue
            plan.push({ invoiceId: a.invoiceId, amount: a.amount })
            remaining -= a.amount
          }
          if (remaining < 0) {
            throw new AppError('VALIDATION_FAILED', 'Allocations exceed payment amount')
          }
        } else {
          for (const inv of unpaidInvoicesFifo(input.customerId, tx)) {
            if (remaining <= 0) break
            const apply = Math.min(remaining, inv.due)
            plan.push({ invoiceId: inv.id, amount: apply })
            remaining -= apply
          }
        }

        for (const a of plan) {
          tx.insert(paymentAllocations)
            .values({
              paymentId: row.id,
              invoiceId: a.invoiceId,
              amount: a.amount,
              status: 'active',
            })
            .run()
          const inv = tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).get()!
          billing.updateInvoicePaid(tx, a.invoiceId, inv.paidTotal + a.amount)
        }
      }

      // Unallocated remainder stays as customer credit via the ledger credit already posted.
      balanceService.upsertSummary(
        input.customerId,
        {
          balance: Number(ledger.getBalance(input.customerId)),
          bottlesWithCustomer: balanceService.computeLiveBottles(input.customerId, tx),
          lastPaymentDate: input.date,
        },
        tx,
      )

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'payments',
          entityId: row.id,
          summary: `${purpose === 'deposit' ? 'Deposit' : 'Payment'} ${receiptNo} of ${input.amount} from ${customer.code}`,
          after: { paymentId: row.id, amount: input.amount, method: input.method, purpose },
        },
        tx,
      )
    })

    return getById(paymentId)
  }

  function voidPayment(id: number, reason: string, userId: number): PaymentDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Void reason is required')
    const row = db.select().from(payments).where(eq(payments.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Payment not found')
    if (row.status === 'void') throw new AppError('CONFLICT', 'Payment already void')
    period.guardPeriodOpen(row.paymentDate)

    db.transaction((tx) => {
      const allocs = tx
        .select()
        .from(paymentAllocations)
        .where(and(eq(paymentAllocations.paymentId, id), eq(paymentAllocations.status, 'active')))
        .all()

      for (const a of allocs) {
        const inv = tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).get()
        if (inv) {
          billing.updateInvoicePaid(tx, a.invoiceId, Math.max(0, inv.paidTotal - a.amount))
        }
        tx.update(paymentAllocations)
          .set({ status: 'void' })
          .where(eq(paymentAllocations.id, a.id))
          .run()
      }

      ledger.reverseEntriesFor(tx, 'payments', id, reason, userId)

      tx.update(payments)
        .set({ status: 'void', voidReason: reason })
        .where(eq(payments.id, id))
        .run()

      balanceService.syncFromSources(row.customerId, tx)

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'payments',
          entityId: id,
          summary: `Voided payment ${row.receiptNo}: ${reason}`,
          before: { status: 'active' },
          after: { status: 'void', reason },
        },
        tx,
      )
    })

    return getById(id)
  }

  function reallocate(
    paymentId: number,
    allocations: Array<{ invoiceId: number; amount: number }>,
    userId: number,
  ): PaymentDto {
    const row = db.select().from(payments).where(eq(payments.id, paymentId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Payment not found')
    if (row.status !== 'active') throw new AppError('CONFLICT', 'Cannot reallocate a void payment')
    const total = allocations.reduce((s, a) => s + a.amount, 0)
    if (total > row.amount) {
      throw new AppError('VALIDATION_FAILED', 'Allocations exceed payment amount')
    }

    db.transaction((tx) => {
      const old = tx
        .select()
        .from(paymentAllocations)
        .where(
          and(eq(paymentAllocations.paymentId, paymentId), eq(paymentAllocations.status, 'active')),
        )
        .all()
      for (const a of old) {
        const inv = tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).get()
        if (inv) billing.updateInvoicePaid(tx, a.invoiceId, Math.max(0, inv.paidTotal - a.amount))
        tx.update(paymentAllocations)
          .set({ status: 'superseded' })
          .where(eq(paymentAllocations.id, a.id))
          .run()
      }
      for (const a of allocations) {
        if (a.amount <= 0) continue
        tx.insert(paymentAllocations)
          .values({ paymentId, invoiceId: a.invoiceId, amount: a.amount, status: 'active' })
          .run()
        const inv = tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).get()!
        billing.updateInvoicePaid(tx, a.invoiceId, inv.paidTotal + a.amount)
      }
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'payments',
          entityId: paymentId,
          summary: `Reallocated payment ${row.receiptNo}`,
          after: { allocations },
        },
        tx,
      )
    })

    return getById(paymentId)
  }

  function list(input: {
    from?: string
    to?: string
    method?: PaymentMethod
    customerId?: number
    status?: 'active' | 'void'
    limit?: number
    offset?: number
  }): { items: PaymentDto[]; total: number; totalAmount: number } {
    let rows = db
      .select()
      .from(payments)
      .orderBy(desc(payments.paymentDate), desc(payments.id))
      .all()
    if (input.from) rows = rows.filter((r) => r.paymentDate >= input.from!)
    if (input.to) rows = rows.filter((r) => r.paymentDate <= input.to!)
    if (input.method) rows = rows.filter((r) => r.method === input.method)
    if (input.customerId) rows = rows.filter((r) => r.customerId === input.customerId)
    if (input.status) rows = rows.filter((r) => r.status === input.status)
    else rows = rows.filter((r) => r.status === 'active')

    const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
    const total = rows.length
    const offset = input.offset ?? 0
    const limit = input.limit ?? 100
    return {
      items: rows.slice(offset, offset + limit).map(toDto),
      total,
      totalAmount,
    }
  }

  /**
   * End-of-day action: post each customer's deliveries.cash_collected for a date
   * as an explicit cash payment. Does NOT run silently during delivery entry —
   * the driver's cash is confirmed when the owner posts it.
   */
  function postCollectedCash(
    date: string,
    userId: number,
  ): { created: number; skipped: number; paymentIds: number[]; totalAmount: number } {
    assertBusinessDate(date)
    period.guardPeriodOpen(date)

    const rows = db
      .select({
        customerId: deliveries.customerId,
        cash: sql<number>`sum(${deliveries.cashCollected})`.as('cash'),
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.deliveryDate, date),
          eq(deliveries.status, 'recorded'),
          sql`${deliveries.cashCollected} > 0`,
        ),
      )
      .groupBy(deliveries.customerId)
      .all()

    let created = 0
    let skipped = 0
    let totalAmount = 0
    const paymentIds: number[] = []

    for (const r of rows) {
      const amount = Number(r.cash)
      if (amount <= 0) {
        skipped += 1
        continue
      }
      // Skip if we already posted for this customer/date (idempotent via notes tag)
      const tag = `[cash_at_delivery:${date}]`
      const existing = db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.customerId, r.customerId),
            eq(payments.status, 'active'),
            like(payments.notes, `${tag}%`),
          ),
        )
        .get()
      if (existing) {
        skipped += 1
        continue
      }

      const payment = recordPayment(
        {
          customerId: r.customerId,
          date,
          amount,
          method: 'cash',
          notes: `${tag} Posted from daily entry cash collected`,
        },
        userId,
      )
      paymentIds.push(payment.id)
      created += 1
      totalAmount += amount
    }

    return { created, skipped, paymentIds, totalAmount }
  }

  function collectedCashPreview(date: string): {
    date: string
    rows: Array<{
      customerId: number
      code: string
      name: string
      cashCollected: number
      alreadyPosted: boolean
    }>
    total: number
  } {
    assertBusinessDate(date)
    const grouped = db
      .select({
        customerId: deliveries.customerId,
        cash: sql<number>`sum(${deliveries.cashCollected})`.as('cash'),
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.deliveryDate, date),
          eq(deliveries.status, 'recorded'),
          sql`${deliveries.cashCollected} > 0`,
        ),
      )
      .groupBy(deliveries.customerId)
      .all()

    const tag = `[cash_at_delivery:${date}]`
    const rows = grouped.map((r) => {
      const c = db.select().from(customers).where(eq(customers.id, r.customerId)).get()
      const alreadyPosted = Boolean(
        db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.customerId, r.customerId),
              eq(payments.status, 'active'),
              like(payments.notes, `${tag}%`),
            ),
          )
          .get(),
      )
      return {
        customerId: r.customerId,
        code: c?.code ?? '',
        name: c?.name ?? '',
        cashCollected: Number(r.cash),
        alreadyPosted,
      }
    })

    return {
      date,
      rows,
      total: rows.reduce((s, r) => s + r.cashCollected, 0),
    }
  }

  return {
    recordPayment,
    voidPayment,
    reallocate,
    getById,
    list,
    postCollectedCash,
    collectedCashPreview,
    unpaidInvoicesFifo,
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>
