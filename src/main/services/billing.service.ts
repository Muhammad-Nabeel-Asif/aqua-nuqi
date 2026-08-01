import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  customerAdjustments,
  customers,
  deliveries,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  sequences,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import {
  addBusinessDays,
  assertPeriod,
  nowIsoUtc,
  periodEnd,
  periodStart,
  previousPeriod,
  todayBusinessDate,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { LedgerService } from './ledger.service'
import type { PeriodService } from './period.service'
import type { SettingsService } from './settings.service'

export type InvoiceLineDto = {
  id: number
  lineNo: number
  lineType:
    'delivery' | 'package' | 'rental' | 'charge' | 'discount' | 'deposit' | 'tax' | 'carry_forward'
  lineDate: string | null
  description: string
  quantity: number
  rate: number
  amount: number
  deliveryId: number | null
  adjustmentId: number | null
}

export type InvoiceDto = {
  id: number
  uuid: string
  invoiceNo: string
  customerId: number
  customerCode: string
  customerName: string
  period: string | null
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string | null
  openingBalance: number
  deliveriesQty: number
  deliveriesTotal: number
  chargesTotal: number
  discountTotal: number
  taxTotal: number
  invoiceTotal: number
  totalPayable: number
  paidTotal: number
  closingBalance: number
  bottlesWithCustomerAtIssue: number
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
  voidReason: string | null
  pdfPath: string | null
  lastSharedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: number | null
  lines: InvoiceLineDto[]
  /** Remaining = totalPayable − paidTotal for non-void */
  balanceDue: number
}

export type InvoicePreview = {
  customerId: number
  customerCode: string
  customerName: string
  period: string
  periodStart: string
  periodEnd: string
  openingBalance: number
  deliveriesCount: number
  deliveriesQty: number
  deliveriesTotal: number
  chargesTotal: number
  discountTotal: number
  taxTotal: number
  invoiceTotal: number
  totalPayable: number
  bottlesWithCustomer: number
  lines: Omit<InvoiceLineDto, 'id'>[]
  warnings: string[]
  skipReason: string | null
  existingInvoiceId: number | null
  existingStatus: string | null
}

export type BatchFilter = {
  mode: 'all' | 'area' | 'route' | 'selected'
  areaId?: number
  routeId?: number
  customerIds?: number[]
}

export type BatchResult = {
  generated: number
  skipped: Array<{ customerId: number; code: string; name: string; reason: string }>
  invoiceIds: number[]
  elapsedMs: number
}

type BuiltLine = Omit<InvoiceLineDto, 'id'>

const DEBIT_ADJ = new Set([
  'damaged_bottle',
  'lost_bottle',
  'dispenser_rent',
  'delivery_charge',
  'other_charge',
])
const CREDIT_ADJ = new Set(['discount', 'write_off'])
const DEPOSIT_ADJ = new Set(['deposit_received', 'deposit_refunded'])

export function createBillingService(
  db: AppDatabase,
  audit: AuditService,
  periodService: PeriodService,
  settings: SettingsService,
  balanceService: BalanceService,
  ledger: LedgerService,
) {
  function formatInvoiceNo(period: string, seq: number): string {
    const prefix = settings.get('invoice.numberPrefix')
    const format = settings.get('invoice.numberFormat')
    const [yyyy, mm] = period.split('-')
    return format
      .replace('{prefix}', prefix)
      .replace('{YYYY}', yyyy ?? '')
      .replace('{MM}', mm ?? '')
      .replace('{seq:4}', String(seq).padStart(4, '0'))
      .replace('{seq}', String(seq))
  }

  function allocateInvoiceNo(tx: AppDatabase, period: string): string {
    const seqName = `invoice:${period}`
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
    return formatInvoiceNo(period, next)
  }

  function dayBefore(date: string): string {
    return addBusinessDays(date, -1)
  }

  function loadCustomer(customerId: number) {
    const row = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
      .get()
    if (!row) throw new AppError('NOT_FOUND', 'Customer not found')
    return row
  }

  function findExistingPeriodInvoice(customerId: number, period: string) {
    return db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, customerId),
          eq(invoices.period, period),
          ne(invoices.status, 'void'),
        ),
      )
      .get()
  }

  function buildComposition(customerId: number, period: string): InvoicePreview {
    assertPeriod(period)
    const customer = loadCustomer(customerId)
    if (customer.customerType === 'walk_in') {
      throw new AppError('VALIDATION_FAILED', 'Walk-in customers are not invoiced')
    }

    const pStart = periodStart(period)
    const pEnd = periodEnd(period)
    const openingAsOf = dayBefore(pStart)
    const openingBalance = Number(ledger.getBalance(customerId, openingAsOf))

    const deliveryRows = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.customerId, customerId),
          eq(deliveries.status, 'recorded'),
          gte(deliveries.deliveryDate, pStart),
          lte(deliveries.deliveryDate, pEnd),
          isNull(deliveries.invoiceId),
        ),
      )
      .orderBy(asc(deliveries.deliveryDate), asc(deliveries.id))
      .all()

    // Also pick up deliveries already marked on an existing draft for this period
    const existing = findExistingPeriodInvoice(customerId, period)
    const billedOnDraft =
      existing?.status === 'draft'
        ? db
            .select()
            .from(deliveries)
            .where(
              and(
                eq(deliveries.customerId, customerId),
                eq(deliveries.status, 'recorded'),
                eq(deliveries.invoiceId, existing.id),
              ),
            )
            .orderBy(asc(deliveries.deliveryDate), asc(deliveries.id))
            .all()
        : []

    const allDeliveries = [...deliveryRows, ...billedOnDraft].sort((a, b) =>
      a.deliveryDate === b.deliveryDate
        ? a.id - b.id
        : a.deliveryDate.localeCompare(b.deliveryDate),
    )

    const adjRows = db
      .select()
      .from(customerAdjustments)
      .where(
        and(
          eq(customerAdjustments.customerId, customerId),
          eq(customerAdjustments.status, 'active'),
          lte(customerAdjustments.adjustmentDate, pEnd),
        ),
      )
      .orderBy(asc(customerAdjustments.adjustmentDate), asc(customerAdjustments.id))
      .all()
      .filter(
        (a) => a.invoiceId == null || (existing?.status === 'draft' && a.invoiceId === existing.id),
      )

    const lines: BuiltLine[] = []
    let lineNo = 1

    // Carry-forward line (informational)
    if (openingBalance !== 0) {
      lines.push({
        lineNo: lineNo++,
        lineType: 'carry_forward',
        lineDate: openingAsOf,
        description: 'Previous balance',
        quantity: 0,
        rate: 0,
        amount: openingBalance,
        deliveryId: null,
        adjustmentId: null,
      })
    }

    let deliveriesQty = 0
    let deliveriesTotal = 0

    if (customer.billingMode === 'monthly_package') {
      for (const d of allDeliveries) {
        deliveriesQty += d.quantity
        lines.push({
          lineNo: lineNo++,
          lineType: 'delivery',
          lineDate: d.deliveryDate,
          description: `Delivery ${d.deliveryDate}`,
          quantity: d.quantity,
          rate: d.rate,
          amount: 0,
          deliveryId: d.id,
          adjustmentId: null,
        })
      }
      const packageAmount = customer.packageAmount ?? 0
      const included = customer.packageIncludedQty ?? 0
      const excessRate = customer.packageExcessRate ?? 0
      lines.push({
        lineNo: lineNo++,
        lineType: 'package',
        lineDate: pEnd,
        description: `Monthly package (${included} bottles included)`,
        quantity: 1,
        rate: packageAmount,
        amount: packageAmount,
        deliveryId: null,
        adjustmentId: null,
      })
      deliveriesTotal = packageAmount
      if (deliveriesQty > included) {
        const excessQty = deliveriesQty - included
        const excessAmount = excessQty * excessRate
        lines.push({
          lineNo: lineNo++,
          lineType: 'charge',
          lineDate: pEnd,
          description: `Excess bottles (${excessQty} × rate)`,
          quantity: excessQty,
          rate: excessRate,
          amount: excessAmount,
          deliveryId: null,
          adjustmentId: null,
        })
        deliveriesTotal += excessAmount
      }
    } else {
      for (const d of allDeliveries) {
        deliveriesQty += d.quantity
        deliveriesTotal += d.amount
        lines.push({
          lineNo: lineNo++,
          lineType: 'delivery',
          lineDate: d.deliveryDate,
          description: d.isFree
            ? `Delivery ${d.deliveryDate} (free)`
            : `Delivery ${d.deliveryDate}`,
          quantity: d.quantity,
          rate: d.rate,
          amount: d.amount,
          deliveryId: d.id,
          adjustmentId: null,
        })
      }
    }

    let chargesTotal = 0
    let discountTotal = 0
    // Package excess was added into deliveriesTotal for package mode; charges are adjustments only.
    // For package, excess is part of deliveries_total conceptually as "this period water charge".
    // Spec: invoice_total = deliveries_total + charges_total − discount_total + tax_total
    // Package amount + excess → deliveries_total (or package in deliveries_total).

    for (const a of adjRows) {
      const kind = a.kind
      if (DEPOSIT_ADJ.has(kind)) {
        // Display-only on invoice; already ledgered. Not in invoice_total / revenue.
        const signed = kind === 'deposit_received' ? -a.amount : a.amount
        lines.push({
          lineNo: lineNo++,
          lineType: 'deposit',
          lineDate: a.adjustmentDate,
          description: a.description ?? kind.replace(/_/g, ' '),
          quantity: a.quantity ?? 1,
          rate: a.amount,
          amount: signed,
          deliveryId: null,
          adjustmentId: a.id,
        })
        continue
      }

      if (DEBIT_ADJ.has(kind)) {
        const lineType = kind === 'dispenser_rent' ? 'rental' : 'charge'
        chargesTotal += a.amount
        lines.push({
          lineNo: lineNo++,
          lineType,
          lineDate: a.adjustmentDate,
          description: a.description ?? kind.replace(/_/g, ' '),
          quantity: a.quantity ?? 1,
          rate: a.amount,
          amount: a.amount,
          deliveryId: null,
          adjustmentId: a.id,
        })
      } else if (CREDIT_ADJ.has(kind)) {
        discountTotal += a.amount
        lines.push({
          lineNo: lineNo++,
          lineType: 'discount',
          lineDate: a.adjustmentDate,
          description: a.description ?? kind.replace(/_/g, ' '),
          quantity: 1,
          rate: a.amount,
          amount: -a.amount,
          deliveryId: null,
          adjustmentId: a.id,
        })
      }
    }

    let taxTotal = 0
    const taxEnabled = settings.get('tax.enabled')
    const taxRate = settings.get('tax.rate')
    if (taxEnabled && taxRate > 0) {
      const taxable = deliveriesTotal + chargesTotal - discountTotal
      taxTotal = Math.round((taxable * taxRate) / 100)
      if (taxTotal !== 0) {
        lines.push({
          lineNo: lineNo++,
          lineType: 'tax',
          lineDate: pEnd,
          description: `Tax (${taxRate}%)`,
          quantity: 0,
          rate: 0,
          amount: taxTotal,
          deliveryId: null,
          adjustmentId: null,
        })
      }
    }

    const invoiceTotal = deliveriesTotal + chargesTotal - discountTotal + taxTotal
    const totalPayable = openingBalance + invoiceTotal

    const warnings: string[] = []
    if (allDeliveries.length === 0) warnings.push('No deliveries in period')
    if (openingBalance < 0) warnings.push('Customer has credit balance')
    if (customer.status === 'paused') warnings.push('Customer is paused')
    if (periodService.isClosed(period)) warnings.push('Period is closed')

    let skipReason: string | null = null
    if (existing && existing.status !== 'draft' && existing.status !== 'void') {
      skipReason = 'INVOICE_EXISTS'
    }

    return {
      customerId,
      customerCode: customer.code,
      customerName: customer.name,
      period,
      periodStart: pStart,
      periodEnd: pEnd,
      openingBalance,
      deliveriesCount: allDeliveries.length,
      deliveriesQty,
      deliveriesTotal,
      chargesTotal,
      discountTotal,
      taxTotal,
      invoiceTotal,
      totalPayable,
      bottlesWithCustomer: balanceService.computeLiveBottles(customerId),
      lines,
      warnings,
      skipReason,
      existingInvoiceId: existing?.id ?? null,
      existingStatus: existing?.status ?? null,
    }
  }

  function previewInvoice(customerId: number, period: string): InvoicePreview {
    return buildComposition(customerId, period)
  }

  function clearDraftLinks(tx: AppDatabase, invoiceId: number): void {
    tx.update(deliveries)
      .set({ invoiceId: null, updatedAt: nowIsoUtc() })
      .where(eq(deliveries.invoiceId, invoiceId))
      .run()
    tx.update(customerAdjustments)
      .set({ invoiceId: null })
      .where(eq(customerAdjustments.invoiceId, invoiceId))
      .run()
    tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).run()
  }

  function persistLines(tx: AppDatabase, invoiceId: number, lines: BuiltLine[]): void {
    for (const line of lines) {
      tx.insert(invoiceLines)
        .values({
          invoiceId,
          lineNo: line.lineNo,
          lineType: line.lineType,
          lineDate: line.lineDate,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          amount: line.amount,
          deliveryId: line.deliveryId,
          adjustmentId: line.adjustmentId,
        })
        .run()
    }
  }

  function markIncluded(tx: AppDatabase, invoiceId: number, lines: BuiltLine[]): void {
    const now = nowIsoUtc()
    for (const line of lines) {
      if (line.deliveryId != null) {
        tx.update(deliveries)
          .set({ invoiceId, updatedAt: now })
          .where(eq(deliveries.id, line.deliveryId))
          .run()
      }
      if (line.adjustmentId != null) {
        tx.update(customerAdjustments)
          .set({ invoiceId })
          .where(eq(customerAdjustments.id, line.adjustmentId))
          .run()
      }
    }
  }

  function toDto(row: typeof invoices.$inferSelect, withLines = true): InvoiceDto {
    const customer = db.select().from(customers).where(eq(customers.id, row.customerId)).get()
    const lines = withLines
      ? db
          .select()
          .from(invoiceLines)
          .where(eq(invoiceLines.invoiceId, row.id))
          .orderBy(asc(invoiceLines.lineNo))
          .all()
          .map((l): InvoiceLineDto => ({
            id: l.id,
            lineNo: l.lineNo,
            lineType: l.lineType as InvoiceLineDto['lineType'],
            lineDate: l.lineDate,
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            amount: l.amount,
            deliveryId: l.deliveryId,
            adjustmentId: l.adjustmentId,
          }))
      : []

    const balanceDue = row.status === 'void' ? 0 : row.totalPayable - row.paidTotal

    return {
      id: row.id,
      uuid: row.uuid,
      invoiceNo: row.invoiceNo,
      customerId: row.customerId,
      customerCode: customer?.code ?? '',
      customerName: customer?.name ?? '',
      period: row.period,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      openingBalance: row.openingBalance,
      deliveriesQty: row.deliveriesQty,
      deliveriesTotal: row.deliveriesTotal,
      chargesTotal: row.chargesTotal,
      discountTotal: row.discountTotal,
      taxTotal: row.taxTotal,
      invoiceTotal: row.invoiceTotal,
      totalPayable: row.totalPayable,
      paidTotal: row.paidTotal,
      closingBalance: row.closingBalance,
      bottlesWithCustomerAtIssue: row.bottlesWithCustomerAtIssue,
      status: row.status as InvoiceDto['status'],
      voidReason: row.voidReason,
      pdfPath: row.pdfPath,
      lastSharedAt: row.lastSharedAt,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      lines,
      balanceDue,
    }
  }

  function getById(id: number): InvoiceDto {
    const row = db.select().from(invoices).where(eq(invoices.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Invoice ${id} not found`)
    return toDto(row)
  }

  function generateInvoice(
    customerId: number,
    period: string,
    opts: {
      issueDate?: string
      notes?: string
      /** When regenerating, allow replacing an existing draft */
      allowReplaceDraft?: boolean
    } = {},
    userId?: number | null,
  ): InvoiceDto {
    assertPeriod(period)
    const preview = buildComposition(customerId, period)
    const existing = findExistingPeriodInvoice(customerId, period)

    if (existing && existing.status !== 'draft') {
      throw new AppError(
        'INVOICE_EXISTS',
        `Invoice already exists for ${preview.customerCode} ${period}`,
        {
          invoiceId: existing.id,
          status: existing.status,
        },
      )
    }

    const issueDate = opts.issueDate ?? todayBusinessDate()
    const dueDays = settings.get('invoice.dueDays')
    const dueDate = addBusinessDays(issueDate, dueDays)
    const now = nowIsoUtc()

    let invoiceId = 0
    db.transaction((tx) => {
      if (existing?.status === 'draft') {
        clearDraftLinks(tx, existing.id)
        const invoiceNo = existing.invoiceNo
        tx.update(invoices)
          .set({
            periodStart: preview.periodStart,
            periodEnd: preview.periodEnd,
            issueDate,
            dueDate,
            openingBalance: preview.openingBalance,
            deliveriesQty: preview.deliveriesQty,
            deliveriesTotal: preview.deliveriesTotal,
            chargesTotal: preview.chargesTotal,
            discountTotal: preview.discountTotal,
            taxTotal: preview.taxTotal,
            invoiceTotal: preview.invoiceTotal,
            totalPayable: preview.totalPayable,
            paidTotal: 0,
            closingBalance: preview.totalPayable,
            bottlesWithCustomerAtIssue: preview.bottlesWithCustomer,
            status: 'draft',
            notes: opts.notes ?? existing.notes,
            updatedAt: now,
          })
          .where(eq(invoices.id, existing.id))
          .run()
        invoiceId = existing.id
        void invoiceNo
      } else {
        const invoiceNo = allocateInvoiceNo(tx, period)
        const row = tx
          .insert(invoices)
          .values({
            uuid: newUuid(),
            invoiceNo,
            customerId,
            period,
            periodStart: preview.periodStart,
            periodEnd: preview.periodEnd,
            issueDate,
            dueDate,
            openingBalance: preview.openingBalance,
            deliveriesQty: preview.deliveriesQty,
            deliveriesTotal: preview.deliveriesTotal,
            chargesTotal: preview.chargesTotal,
            discountTotal: preview.discountTotal,
            taxTotal: preview.taxTotal,
            invoiceTotal: preview.invoiceTotal,
            totalPayable: preview.totalPayable,
            paidTotal: 0,
            closingBalance: preview.totalPayable,
            bottlesWithCustomerAtIssue: preview.bottlesWithCustomer,
            status: 'draft',
            notes: opts.notes ?? null,
            createdAt: now,
            updatedAt: now,
            createdBy: userId ?? null,
          })
          .returning()
          .get()!
        invoiceId = row.id
      }

      persistLines(tx, invoiceId, preview.lines)
      markIncluded(tx, invoiceId, preview.lines)

      audit.record(
        {
          userId,
          action: existing ? 'update' : 'create',
          entityTable: 'invoices',
          entityId: invoiceId,
          summary: `Generated draft invoice for ${preview.customerCode} ${period}`,
          after: { invoiceId, period, invoiceTotal: preview.invoiceTotal },
        },
        tx,
      )
    })

    return getById(invoiceId)
  }

  function issueInvoice(invoiceId: number, userId?: number | null): InvoiceDto {
    const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Invoice not found')
    if (row.status !== 'draft') {
      throw new AppError('INVOICE_ALREADY_ISSUED', `Invoice is ${row.status}, cannot issue`)
    }

    // Opening balance is already in the ledger — append invoice_total only, never total_payable.
    // Prior customer credit is reflected in opening_balance / total_payable carry-forward.
    db.transaction((tx) => {
      const now = nowIsoUtc()
      if (row.invoiceTotal !== 0) {
        ledger.appendEntry(tx, {
          customerId: row.customerId,
          date: row.issueDate,
          type: 'invoice',
          debit: row.invoiceTotal > 0 ? row.invoiceTotal : 0,
          credit: row.invoiceTotal < 0 ? -row.invoiceTotal : 0,
          description: `Invoice ${row.invoiceNo}`,
          refTable: 'invoices',
          refId: row.id,
          createdBy: userId,
        })
      }

      tx.update(invoices)
        .set({
          status: 'issued',
          closingBalance: row.totalPayable - row.paidTotal,
          updatedAt: now,
        })
        .where(eq(invoices.id, invoiceId))
        .run()

      balanceService.upsertSummary(
        row.customerId,
        {
          balance: Number(ledger.getBalance(row.customerId)),
          bottlesWithCustomer: balanceService.computeLiveBottles(row.customerId, tx),
          lastInvoiceId: invoiceId,
        },
        tx,
      )

      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'invoices',
          entityId: invoiceId,
          summary: `Issued invoice ${row.invoiceNo}`,
          before: { status: 'draft' },
          after: { status: 'issued' },
        },
        tx,
      )
    })

    return getById(invoiceId)
  }

  function voidInvoice(invoiceId: number, reason: string, userId?: number | null): InvoiceDto {
    if (!reason.trim()) throw new AppError('VALIDATION_FAILED', 'Void reason is required')
    const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'Invoice not found')
    if (row.status === 'void') throw new AppError('CONFLICT', 'Invoice already void')
    if (row.status === 'draft') {
      // Draft: just clear links and mark void — no ledger to reverse
      db.transaction((tx) => {
        clearDraftLinks(tx, invoiceId)
        tx.update(invoices)
          .set({
            status: 'void',
            voidReason: reason,
            updatedAt: nowIsoUtc(),
          })
          .where(eq(invoices.id, invoiceId))
          .run()
        audit.record(
          {
            userId,
            action: 'void',
            entityTable: 'invoices',
            entityId: invoiceId,
            summary: `Voided draft invoice ${row.invoiceNo}: ${reason}`,
          },
          tx,
        )
      })
      return getById(invoiceId)
    }

    // Check allocations
    const allocs = db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.invoiceId, invoiceId))
      .all()
    if (allocs.length > 0) {
      throw new AppError(
        'CONFLICT',
        'Invoice has payment allocations — void those payments first or re-allocate',
      )
    }

    db.transaction((tx) => {
      if (row.invoiceTotal !== 0) {
        ledger.reverseEntriesFor(tx, 'invoices', invoiceId, reason, userId)
      }
      clearDraftLinks(tx, invoiceId)
      tx.update(invoices)
        .set({
          status: 'void',
          voidReason: reason,
          paidTotal: 0,
          closingBalance: 0,
          updatedAt: nowIsoUtc(),
        })
        .where(eq(invoices.id, invoiceId))
        .run()

      balanceService.syncFromSources(row.customerId, tx)

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'invoices',
          entityId: invoiceId,
          summary: `Voided invoice ${row.invoiceNo}: ${reason}`,
          before: { status: row.status },
          after: { status: 'void', reason },
        },
        tx,
      )
    })

    return getById(invoiceId)
  }

  function generateBatch(
    period: string,
    filter: BatchFilter,
    opts: {
      issueDate?: string
      includeZeroActivity?: boolean
      customerIds?: number[]
    } = {},
    userId?: number | null,
  ): BatchResult {
    assertPeriod(period)
    const start = performance.now()
    const includeZero = opts.includeZeroActivity ?? false

    let customerIds: number[] = []
    if (filter.mode === 'selected' && filter.customerIds?.length) {
      customerIds = filter.customerIds
    } else {
      const conditions = [
        isNull(customers.deletedAt),
        ne(customers.customerType, 'walk_in'),
        ne(customers.status, 'inactive'),
      ]
      if (filter.mode === 'area' && filter.areaId != null) {
        conditions.push(eq(customers.areaId, filter.areaId))
      }
      if (filter.mode === 'route' && filter.routeId != null) {
        conditions.push(eq(customers.routeId, filter.routeId))
      }
      customerIds = db
        .select({ id: customers.id })
        .from(customers)
        .where(and(...conditions))
        .all()
        .map((r) => r.id)
    }

    const skipped: BatchResult['skipped'] = []
    const invoiceIds: number[] = []

    for (const customerId of customerIds) {
      try {
        const preview = buildComposition(customerId, period)
        if (preview.skipReason === 'INVOICE_EXISTS') {
          skipped.push({
            customerId,
            code: preview.customerCode,
            name: preview.customerName,
            reason: 'Invoice already exists',
          })
          continue
        }
        const noActivity = preview.deliveriesCount === 0 && preview.openingBalance === 0
        const onlyOpening = preview.deliveriesCount === 0 && preview.openingBalance !== 0
        if (noActivity && !includeZero) {
          skipped.push({
            customerId,
            code: preview.customerCode,
            name: preview.customerName,
            reason: 'No activity',
          })
          continue
        }
        if (onlyOpening && !includeZero) {
          // Spec: include if opening balance non-zero (reminder). Default include.
        }
        // Actually: "by default skip if no deliveries AND opening is zero; include if opening non-zero"
        // onlyOpening should be included by default
        if (noActivity) {
          skipped.push({
            customerId,
            code: preview.customerCode,
            name: preview.customerName,
            reason: 'No activity',
          })
          continue
        }

        const inv = generateInvoice(
          customerId,
          period,
          { issueDate: opts.issueDate, allowReplaceDraft: true },
          userId,
        )
        invoiceIds.push(inv.id)
      } catch (err) {
        const customer = db.select().from(customers).where(eq(customers.id, customerId)).get()
        skipped.push({
          customerId,
          code: customer?.code ?? String(customerId),
          name: customer?.name ?? '',
          reason: err instanceof AppError ? err.message : String(err),
        })
      }
    }

    return {
      generated: invoiceIds.length,
      skipped,
      invoiceIds,
      elapsedMs: Math.round(performance.now() - start),
    }
  }

  function listInvoices(input: {
    period?: string
    status?: string
    customerId?: number
    areaId?: number
    routeId?: number
    overdueOnly?: boolean
    minAmount?: number
    maxAmount?: number
    search?: string
    limit?: number
    offset?: number
  }): { items: InvoiceDto[]; total: number } {
    const all = db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.issueDate), desc(invoices.id))
      .all()

    const today = todayBusinessDate()
    let filtered = all

    if (input.period) filtered = filtered.filter((r) => r.period === input.period)
    if (input.status) filtered = filtered.filter((r) => r.status === input.status)
    if (input.customerId) filtered = filtered.filter((r) => r.customerId === input.customerId)
    if (input.minAmount != null)
      filtered = filtered.filter((r) => r.invoiceTotal >= input.minAmount!)
    if (input.maxAmount != null)
      filtered = filtered.filter((r) => r.invoiceTotal <= input.maxAmount!)
    if (input.overdueOnly) {
      filtered = filtered.filter(
        (r) =>
          r.dueDate != null &&
          r.dueDate < today &&
          (r.status === 'issued' || r.status === 'partially_paid'),
      )
    }

    if (input.areaId != null || input.routeId != null || input.search) {
      const custMap = new Map(
        db
          .select()
          .from(customers)
          .all()
          .map((c) => [c.id, c]),
      )
      filtered = filtered.filter((r) => {
        const c = custMap.get(r.customerId)
        if (!c) return false
        if (input.areaId != null && c.areaId !== input.areaId) return false
        if (input.routeId != null && c.routeId !== input.routeId) return false
        if (input.search) {
          const q = input.search.toLowerCase()
          if (
            !c.name.toLowerCase().includes(q) &&
            !c.code.toLowerCase().includes(q) &&
            !r.invoiceNo.toLowerCase().includes(q)
          )
            return false
        }
        return true
      })
    }

    const total = filtered.length
    const offset = input.offset ?? 0
    const limit = input.limit ?? 100
    const page = filtered.slice(offset, offset + limit)
    return { items: page.map((r) => toDto(r, false)), total }
  }

  function issueAll(
    invoiceIds: number[],
    userId?: number | null,
  ): { issued: number; errors: string[] } {
    let issued = 0
    const errors: string[] = []
    for (const id of invoiceIds) {
      try {
        issueInvoice(id, userId)
        issued += 1
      } catch (err) {
        errors.push(err instanceof AppError ? err.message : String(err))
      }
    }
    return { issued, errors }
  }

  function markShared(invoiceIds: number[], userId?: number | null): number {
    const now = nowIsoUtc()
    let n = 0
    db.transaction((tx) => {
      for (const id of invoiceIds) {
        tx.update(invoices)
          .set({ lastSharedAt: now, updatedAt: now })
          .where(eq(invoices.id, id))
          .run()
        n += 1
      }
      audit.record(
        {
          userId,
          action: 'export',
          entityTable: 'invoices',
          summary: `Marked ${n} invoices as shared`,
          after: { invoiceIds },
        },
        tx,
      )
    })
    return n
  }

  function updateInvoicePaid(tx: AppDatabase, invoiceId: number, paidTotal: number): void {
    const row = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get()
    if (!row || row.status === 'void' || row.status === 'draft') return
    let status: string = row.status
    if (paidTotal <= 0) status = 'issued'
    else if (paidTotal >= row.totalPayable) status = 'paid'
    else status = 'partially_paid'
    tx.update(invoices)
      .set({
        paidTotal,
        status,
        closingBalance: row.totalPayable - paidTotal,
        updatedAt: nowIsoUtc(),
      })
      .where(eq(invoices.id, invoiceId))
      .run()
  }

  /** Revenue accrual for a period — deposits excluded by construction (not in invoice_total). */
  function revenueAccrual(period: string): number {
    assertPeriod(period)
    const rows = db
      .select({ invoiceTotal: invoices.invoiceTotal })
      .from(invoices)
      .where(and(eq(invoices.period, period), ne(invoices.status, 'void')))
      .all()
    return rows.reduce((s, r) => s + r.invoiceTotal, 0)
  }

  /** Cash revenue — active payments in period, excluding deposit-tagged notes. */
  function revenueCash(period: string): number {
    assertPeriod(period)
    const pStart = periodStart(period)
    const pEnd = periodEnd(period)
    const rows = db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, 'active'),
          gte(payments.paymentDate, pStart),
          lte(payments.paymentDate, pEnd),
        ),
      )
      .all()
      .filter((p) => !p.notes?.startsWith('[deposit]'))
    return rows.reduce((s, r) => s + r.amount, 0)
  }

  function listPeriodsOverview(): Array<{
    period: string
    closed: boolean
    deliveryCount: number
    invoiceCount: number
    revenue: number
  }> {
    const deliveryPeriods = db
      .select({ period: sql<string>`substr(${deliveries.deliveryDate}, 1, 7)`.as('period') })
      .from(deliveries)
      .groupBy(sql`substr(${deliveries.deliveryDate}, 1, 7)`)
      .all()
      .map((r) => r.period)

    const invoicePeriods = db
      .select({ period: invoices.period })
      .from(invoices)
      .all()
      .map((r) => r.period)
      .filter((p): p is string => Boolean(p))

    const closed = periodService
      .list()
      .filter((p) => !p.reopenedAt)
      .map((p) => p.period)
    const all = new Set([
      ...deliveryPeriods,
      ...invoicePeriods,
      ...closed,
      previousPeriod(todayBusinessDate().slice(0, 7)),
    ])

    return [...all]
      .filter(Boolean)
      .sort()
      .reverse()
      .map((p) => {
        const deliveryCount =
          db
            .select({ n: sql<number>`count(*)` })
            .from(deliveries)
            .where(
              and(
                eq(deliveries.status, 'recorded'),
                gte(deliveries.deliveryDate, periodStart(p)),
                lte(deliveries.deliveryDate, periodEnd(p)),
              ),
            )
            .get()?.n ?? 0
        const invoiceCount =
          db
            .select({ n: sql<number>`count(*)` })
            .from(invoices)
            .where(and(eq(invoices.period, p), ne(invoices.status, 'void')))
            .get()?.n ?? 0
        return {
          period: p,
          closed: periodService.isClosed(p),
          deliveryCount: Number(deliveryCount),
          invoiceCount: Number(invoiceCount),
          revenue: revenueAccrual(p),
        }
      })
  }

  function previewBatch(
    period: string,
    filter: BatchFilter,
    opts: { includeZeroActivity?: boolean } = {},
  ): InvoicePreview[] {
    assertPeriod(period)
    let customerIds: number[] = []
    if (filter.mode === 'selected' && filter.customerIds?.length) {
      customerIds = filter.customerIds
    } else {
      const conditions = [
        isNull(customers.deletedAt),
        ne(customers.customerType, 'walk_in'),
        ne(customers.status, 'inactive'),
      ]
      if (filter.mode === 'area' && filter.areaId != null)
        conditions.push(eq(customers.areaId, filter.areaId))
      if (filter.mode === 'route' && filter.routeId != null)
        conditions.push(eq(customers.routeId, filter.routeId))
      customerIds = db
        .select({ id: customers.id })
        .from(customers)
        .where(and(...conditions))
        .all()
        .map((r) => r.id)
    }

    const includeZero = opts.includeZeroActivity ?? false
    const previews: InvoicePreview[] = []
    for (const id of customerIds) {
      try {
        const p = buildComposition(id, period)
        const noActivity = p.deliveriesCount === 0 && p.openingBalance === 0
        if (noActivity && !includeZero) {
          p.skipReason = p.skipReason ?? 'No activity'
        }
        previews.push(p)
      } catch {
        // skip invalid
      }
    }
    return previews
  }

  return {
    previewInvoice,
    previewBatch,
    generateInvoice,
    generateBatch,
    issueInvoice,
    issueAll,
    voidInvoice,
    getById,
    listInvoices,
    markShared,
    updateInvoicePaid,
    revenueAccrual,
    revenueCash,
    listPeriodsOverview,
    formatInvoiceNo,
    allocateInvoiceNo,
    toDto,
  }
}

export type BillingService = ReturnType<typeof createBillingService>
