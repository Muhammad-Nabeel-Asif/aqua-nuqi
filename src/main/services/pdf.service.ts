import fs from 'node:fs'
import path from 'node:path'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { customers, deliveries as deliveriesTable, invoices, ledgerEntries } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  BatchProgressEvent,
  ExportExcelInput,
  ExportTableInput,
  PageSizeSpec,
  PrintTemplateId,
} from '@shared/contracts/pdf'
import { THERMAL_80MM_PAGE } from '@shared/contracts/pdf'
import { formatDisplayDate, nowIsoUtc, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { formatMoney, type Paisa } from '@shared/money'
import { numberToWords, type NumberingSystem } from '@shared/number-to-words'
import { toWhatsAppE164 } from '@shared/phone'
import { invoicePdfFileName, slugifyName } from '@shared/slug'
import type { AuditService } from './audit.service'
import type { BillingService } from './billing.service'
import type { CustomerService } from './customer.service'
import type { DeliveryService } from './delivery.service'
import type { LedgerService } from './ledger.service'
import type { PaymentService } from './payment.service'
import type { ReceivablesService } from './receivables.service'
import type { SettingsService } from './settings.service'

export type BusinessPrintHeader = {
  name: string
  address: string
  phone: string
  phone2: string
  email: string
  bankDetails: string
  taxNumber: string
  logoDataUrl: string | null
  accentColour: string
  footerNote: string
  termsText: string
  showBottleBalance: boolean
  showRateColumn: boolean
  currencySymbol: string
  decimalPlaces: number
  numberingSystem: NumberingSystem
}

export type InvoicePrintPayload = {
  kind: 'invoice'
  business: BusinessPrintHeader
  invoice: ReturnType<BillingService['getById']>
  customer: {
    code: string
    name: string
    addressLine: string | null
    phonePrimary: string | null
    phoneSecondary: string | null
    securityDepositHeld: number
  }
  emptiesReturned: number
  amountInWords: string
  generatedAt: string
}

export type PdfRenderer = {
  renderPdf: (opts: {
    jobId: string
    template: PrintTemplateId
    payload: unknown
    pageSize: PageSizeSpec
    accentColour: string
    margins?: { top?: number; bottom?: number; left?: number; right?: number }
    landscape?: boolean
  }) => Promise<Buffer>
  print: (opts: {
    jobId: string
    template: PrintTemplateId
    payload: unknown
    pageSize: PageSizeSpec
    accentColour: string
    deviceName?: string
    silent?: boolean
    landscape?: boolean
  }) => Promise<void>
}

export type PdfPlatform = {
  getDocumentsRoot: () => string
  openExternal: (url: string) => Promise<void>
  showItemInFolder: (filePath: string) => void
  writeClipboard: (text: string) => void
  openPath: (filePath: string) => Promise<string>
  saveDialog: (opts: {
    defaultPath: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string | null>
  readLogoAsDataUrl: (logoPath: string) => string | null
  emitProgress?: (event: BatchProgressEvent) => void
}

export function createPdfService(
  db: AppDatabase,
  audit: AuditService,
  settings: SettingsService,
  billing: BillingService,
  payments: PaymentService,
  ledger: LedgerService,
  customersSvc: CustomerService,
  deliveries: DeliveryService,
  receivables: ReceivablesService,
  renderer: PdfRenderer,
  platform: PdfPlatform,
) {
  const cancelJobs = new Set<string>()

  function businessHeader(): BusinessPrintHeader {
    const logoPath = settings.get('business.logoPath')
    return {
      name: settings.get('business.name') || 'Aqua Nuqi',
      address: settings.get('business.address'),
      phone: settings.get('business.phone'),
      phone2: settings.get('business.phone2'),
      email: settings.get('business.email'),
      bankDetails: settings.get('business.bankDetails'),
      taxNumber: settings.get('business.taxNumber'),
      logoDataUrl: logoPath ? platform.readLogoAsDataUrl(logoPath) : null,
      accentColour: settings.get('invoice.accentColour') || '#0284c7',
      footerNote: settings.get('invoice.footerNote'),
      termsText: settings.get('invoice.termsText'),
      showBottleBalance: settings.get('invoice.showBottleBalance'),
      showRateColumn: settings.get('invoice.showRateColumn'),
      currencySymbol: settings.get('locale.currencySymbol'),
      decimalPlaces: settings.get('locale.decimalPlaces'),
      numberingSystem: settings.get('locale.numberingSystem') as NumberingSystem,
    }
  }

  function money(p: number): string {
    return formatMoney(p as Paisa, {
      symbol: settings.get('locale.currencySymbol'),
      decimalPlaces: settings.get('locale.decimalPlaces'),
    })
  }

  function words(p: number): string {
    return numberToWords(p as Paisa, {
      system: settings.get('locale.numberingSystem') as NumberingSystem,
    })
  }

  function documentsRoot(): string {
    const configured = settings.get('documents.folder')
    return configured || platform.getDocumentsRoot()
  }

  function invoiceDir(period: string | null): string {
    const ym = period ?? todayBusinessDate().slice(0, 7)
    const dir = path.join(documentsRoot(), 'Invoices', ym)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  function miscDir(subdir: string): string {
    const dir = path.join(documentsRoot(), subdir)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  function setPdfPath(invoiceId: number, pdfPath: string): void {
    const now = nowIsoUtc()
    db.update(invoices).set({ pdfPath, updatedAt: now }).where(eq(invoices.id, invoiceId)).run()
  }

  /** Empties on delivery rows linked to this invoice (frozen once invoiced). */
  function emptiesFromInvoiceLines(invoice: ReturnType<BillingService['getById']>): number {
    const ids = invoice.lines
      .map((l) => l.deliveryId)
      .filter((id): id is number => typeof id === 'number' && id > 0)
    if (!ids.length) return 0
    const rows = db
      .select({ empties: deliveriesTable.emptiesCollected })
      .from(deliveriesTable)
      .where(inArray(deliveriesTable.id, ids))
      .all()
    return rows.reduce((sum, r) => sum + r.empties, 0)
  }

  /** Deposit held as of a business date (ledger deposit_received − deposit_refunded). */
  function securityDepositAsOf(customerId: number, asOfDate: string): number {
    const rows = db
      .select({
        entryType: ledgerEntries.entryType,
        debit: ledgerEntries.debit,
        credit: ledgerEntries.credit,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, customerId),
          lte(ledgerEntries.entryDate, asOfDate),
          sql`${ledgerEntries.entryType} IN ('deposit_received', 'deposit_refunded')`,
        ),
      )
      .all()
    let held = 0
    for (const r of rows) {
      if (r.entryType === 'deposit_received') held += r.credit
      else if (r.entryType === 'deposit_refunded') held -= r.debit
    }
    return Math.max(0, held)
  }

  /** Closing balance on the ledger entry for this payment (not live AR). */
  function balanceAfterPayment(paymentId: number, customerId: number): number {
    const entry = db
      .select({ balanceAfter: ledgerEntries.balanceAfter })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.refTable, 'payments'), eq(ledgerEntries.refId, paymentId)))
      .get()
    if (entry) return entry.balanceAfter
    return customersSvc.getById(customerId).balance
  }

  function defaultReceiptVariant(): 'a5' | 'thermal' {
    // Stored as string; defaults type is literal 'A4' but UI also allows 'thermal'.
    return String(settings.get('invoice.defaultPageSize')) === 'thermal' ? 'thermal' : 'a5'
  }

  function thermalPrinterName(): string | undefined {
    return settings.get('print.defaultThermalPrinter') || undefined
  }

  function buildInvoicePayload(invoiceId: number): InvoicePrintPayload {
    const invoice = billing.getById(invoiceId)
    const customer = customersSvc.getById(invoice.customerId)
    const isDraft = invoice.status === 'draft'
    let empties = 0
    let depositHeld = customer.securityDepositHeld
    if (isDraft) {
      if (invoice.period) {
        try {
          empties = deliveries.getCustomerCard({
            customerId: invoice.customerId,
            period: invoice.period,
          }).totalEmpties
        } catch {
          empties = 0
        }
      }
    } else {
      // Issued+ documents must not pick up later empties/deposit edits.
      empties = emptiesFromInvoiceLines(invoice)
      depositHeld = securityDepositAsOf(invoice.customerId, invoice.issueDate)
    }
    return {
      kind: 'invoice',
      business: businessHeader(),
      invoice,
      customer: {
        code: customer.code,
        name: customer.name,
        addressLine: customer.addressLine,
        phonePrimary: customer.phonePrimary,
        phoneSecondary: customer.phoneSecondary,
        securityDepositHeld: depositHeld,
      },
      emptiesReturned: empties,
      amountInWords: words(invoice.totalPayable),
      generatedAt: nowIsoUtc(),
    }
  }

  async function writePdf(
    template: PrintTemplateId,
    payload: unknown,
    destPath: string,
    pageSize: PageSizeSpec,
    opts?: { landscape?: boolean; margins?: RenderMargins },
  ): Promise<string> {
    const buf = await renderer.renderPdf({
      jobId: newUuid(),
      template,
      payload,
      pageSize,
      accentColour: settings.get('invoice.accentColour') || '#0284c7',
      landscape: opts?.landscape,
      margins: opts?.margins,
    })
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, buf)
    return destPath
  }

  type RenderMargins = { top?: number; bottom?: number; left?: number; right?: number }

  async function generateInvoicePdf(
    invoiceId: number,
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string; invoiceId: number }> {
    const payload = buildInvoicePayload(invoiceId)
    const fileName = invoicePdfFileName({
      invoiceNo: payload.invoice.invoiceNo,
      customerCode: payload.customer.code,
      customerName: payload.customer.name,
    })
    const dest = path.join(invoiceDir(payload.invoice.period), fileName)
    await writePdf('invoice', payload, dest, 'A4')
    setPdfPath(invoiceId, dest)
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'invoices',
      entityId: invoiceId,
      summary: `Generated PDF ${fileName}`,
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest, invoiceId }
  }

  function cancelBatch(jobId: string): void {
    cancelJobs.add(jobId)
  }

  async function batchGenerateInvoices(
    input: {
      period?: string
      invoiceIds?: number[]
      filter?: {
        mode: 'all' | 'area' | 'route' | 'selected'
        areaId?: number
        routeId?: number
        customerIds?: number[]
      }
      jobId?: string
    },
    userId?: number | null,
  ): Promise<{
    generated: number
    cancelled: boolean
    folder: string
    files: string[]
    errors: Array<{ invoiceId: number; message: string }>
    elapsedMs: number
  }> {
    const jobId = input.jobId ?? newUuid()
    cancelJobs.delete(jobId)
    const t0 = Date.now()

    let ids = input.invoiceIds ?? []
    if (!ids.length && input.period) {
      const listed = billing.listInvoices({
        period: input.period,
        limit: 5000,
        ...(input.filter?.mode === 'area' && input.filter.areaId
          ? { areaId: input.filter.areaId }
          : {}),
        ...(input.filter?.mode === 'route' && input.filter.routeId
          ? { routeId: input.filter.routeId }
          : {}),
      })
      ids = listed.items.filter((i) => i.status !== 'void').map((i) => i.id)
      if (input.filter?.mode === 'selected' && input.filter.customerIds?.length) {
        const set = new Set(input.filter.customerIds)
        ids = listed.items
          .filter((i) => set.has(i.customerId) && i.status !== 'void')
          .map((i) => i.id)
      }
    }
    if (!ids.length) {
      throw new AppError('VALIDATION_FAILED', 'No invoices to export')
    }

    const folder = invoiceDir(input.period ?? null)
    const files: string[] = []
    const errors: Array<{ invoiceId: number; message: string }> = []
    let cancelled = false

    for (let i = 0; i < ids.length; i++) {
      if (cancelJobs.has(jobId)) {
        cancelled = true
        platform.emitProgress?.({
          jobId,
          current: i,
          total: ids.length,
          status: 'cancelled',
          message: 'Cancelled by user',
        })
        break
      }
      const invoiceId = ids[i]!
      platform.emitProgress?.({
        jobId,
        current: i + 1,
        total: ids.length,
        invoiceId,
        status: 'working',
      })
      try {
        const r = await generateInvoicePdf(invoiceId, { userId })
        files.push(r.path)
        platform.emitProgress?.({
          jobId,
          current: i + 1,
          total: ids.length,
          invoiceId,
          fileName: path.basename(r.path),
          status: 'working',
        })
      } catch (err) {
        errors.push({
          invoiceId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    cancelJobs.delete(jobId)
    platform.emitProgress?.({
      jobId,
      current: files.length,
      total: ids.length,
      status: cancelled ? 'cancelled' : 'done',
      message: cancelled
        ? `Cancelled after ${files.length} of ${ids.length}`
        : `Generated ${files.length} PDFs`,
    })

    audit.record({
      userId,
      action: 'export',
      entityTable: 'invoices',
      summary: `Batch PDF export: ${files.length} generated` + (cancelled ? ' (cancelled)' : ''),
      after: { folder, count: files.length, errors: errors.length, cancelled },
    })

    return {
      generated: files.length,
      cancelled,
      folder,
      files,
      errors,
      elapsedMs: Date.now() - t0,
    }
  }

  async function printInvoice(
    invoiceId: number,
    opts: { deviceName?: string; silent?: boolean } = {},
  ): Promise<void> {
    const payload = buildInvoicePayload(invoiceId)
    const device = opts.deviceName || settings.get('print.defaultPrinter') || undefined
    await renderer.print({
      jobId: newUuid(),
      template: 'invoice',
      payload,
      pageSize: 'A4',
      accentColour: payload.business.accentColour,
      deviceName: device || undefined,
      silent: opts.silent,
    })
  }

  async function generateReceiptPdf(
    paymentId: number,
    variant: 'a5' | 'thermal' | undefined,
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const resolved = variant ?? defaultReceiptVariant()
    const payment = payments.getById(paymentId)
    const business = businessHeader()
    const payload = {
      kind: 'payment-receipt' as const,
      variant: resolved,
      business,
      payment,
      balanceAfter: balanceAfterPayment(paymentId, payment.customerId),
      amountInWords: words(payment.amount),
      receivedBy: '',
      generatedAt: nowIsoUtc(),
    }
    const pageSize: PageSizeSpec = resolved === 'thermal' ? THERMAL_80MM_PAGE : 'A5'
    const template: PrintTemplateId =
      resolved === 'thermal' ? 'payment-receipt-thermal' : 'payment-receipt-a5'
    const fileName = `RCV-${payment.receiptNo ?? payment.id}-${slugifyName(payment.customerName)}.pdf`
    const dest = path.join(miscDir('Receipts'), fileName)
    const margins =
      resolved === 'thermal'
        ? { top: 0.15, bottom: 0.15, left: 0.12, right: 0.12 }
        : { top: 0.35, bottom: 0.35, left: 0.4, right: 0.4 }
    await writePdf(template, payload, dest, pageSize, { margins })
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'payments',
      entityId: paymentId,
      summary: `Generated ${resolved} receipt PDF`,
      after: { path: dest, thermalPrinter: thermalPrinterName() ?? null },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  async function printReceipt(
    paymentId: number,
    variant: 'a5' | 'thermal' | undefined,
    opts: { deviceName?: string; silent?: boolean } = {},
  ): Promise<void> {
    const resolved = variant ?? defaultReceiptVariant()
    const payment = payments.getById(paymentId)
    const business = businessHeader()
    const payload = {
      kind: 'payment-receipt' as const,
      variant: resolved,
      business,
      payment,
      balanceAfter: balanceAfterPayment(paymentId, payment.customerId),
      amountInWords: words(payment.amount),
      receivedBy: '',
      generatedAt: nowIsoUtc(),
    }
    const pageSize: PageSizeSpec = resolved === 'thermal' ? THERMAL_80MM_PAGE : 'A5'
    const template: PrintTemplateId =
      resolved === 'thermal' ? 'payment-receipt-thermal' : 'payment-receipt-a5'
    const device =
      opts.deviceName ||
      (resolved === 'thermal'
        ? thermalPrinterName() || settings.get('print.defaultPrinter') || undefined
        : settings.get('print.defaultPrinter') || undefined)
    await renderer.print({
      jobId: newUuid(),
      template,
      payload,
      pageSize,
      accentColour: business.accentColour,
      deviceName: device || undefined,
      silent: opts.silent,
    })
  }

  async function generateDeliverySlip(
    deliveryId: number,
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const delivery = deliveries.getById(deliveryId)
    const customer = customersSvc.getById(delivery.customerId)
    const business = businessHeader()
    const payload = {
      kind: 'delivery-slip' as const,
      business,
      delivery,
      customer: {
        code: customer.code,
        name: customer.name,
        phonePrimary: customer.phonePrimary,
      },
      runningBalance: customer.balance,
      generatedAt: nowIsoUtc(),
    }
    const dest = path.join(
      miscDir('DeliverySlips'),
      `SLIP-${delivery.deliveryDate}-${customer.code}-${delivery.id}.pdf`,
    )
    await writePdf('delivery-slip', payload, dest, THERMAL_80MM_PAGE, {
      margins: { top: 0.15, bottom: 0.15, left: 0.12, right: 0.12 },
    })
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'deliveries',
      entityId: deliveryId,
      summary: 'Generated delivery slip PDF',
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  async function generateStatementPdf(
    customerId: number,
    range: { from?: string; to?: string } = {},
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const customer = customersSvc.getById(customerId)
    const entries = ledger.getLedger(customerId, range)
    const opening =
      entries.length > 0
        ? entries[0]!.balanceAfter - entries[0]!.debit + entries[0]!.credit
        : customer.balance
    const closing = entries.length > 0 ? entries[entries.length - 1]!.balanceAfter : opening
    const business = businessHeader()
    const payload = {
      kind: 'customer-statement' as const,
      business,
      customer: {
        code: customer.code,
        name: customer.name,
        addressLine: customer.addressLine,
        phonePrimary: customer.phonePrimary,
      },
      from: range.from ?? null,
      to: range.to ?? null,
      openingBalance: opening,
      closingBalance: closing,
      entries,
      generatedAt: nowIsoUtc(),
    }
    const dest = path.join(
      miscDir('Statements'),
      `STMT-${customer.code}-${slugifyName(customer.name)}-${todayBusinessDate()}.pdf`,
    )
    await writePdf('customer-statement', payload, dest, 'A4')
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'customers',
      entityId: customerId,
      summary: 'Generated customer statement PDF',
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  async function generateDeliveryCardPdf(
    customerId: number,
    period: string,
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const card = deliveries.getCustomerCard({ customerId, period })
    const business = businessHeader()
    const payload = {
      kind: 'delivery-card' as const,
      business,
      card,
      generatedAt: nowIsoUtc(),
    }
    const dest = path.join(miscDir('DeliveryCards'), `CARD-${card.code}-${period}.pdf`)
    await writePdf('delivery-card', payload, dest, 'A4')
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'customers',
      entityId: customerId,
      summary: `Generated delivery card PDF for ${period}`,
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  async function generateBottlesOutPdf(
    filters: {
      search?: string
      routeId?: number
      areaId?: number
      minBottles?: number
    } = {},
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const report = deliveries.listBottlesOut(filters)
    const business = businessHeader()
    const payload = {
      kind: 'bottles-out' as const,
      business,
      report,
      filters,
      generatedAt: nowIsoUtc(),
    }
    const dest = path.join(miscDir('Reports'), `bottles-out-${todayBusinessDate()}.pdf`)
    await writePdf('bottles-out', payload, dest, 'A4', { landscape: true })
    audit.record({
      userId: opts.userId,
      action: 'export',
      summary: `Exported bottles-out PDF (${report.items.length} rows)`,
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  async function generateReceivablesPdf(
    asOf?: string,
    opts: { openAfter?: boolean; userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const report = receivables.report(asOf)
    const business = businessHeader()
    const payload = {
      kind: 'receivables' as const,
      business,
      report,
      generatedAt: nowIsoUtc(),
    }
    const dest = path.join(miscDir('Reports'), `receivables-${report.asOf}.pdf`)
    await writePdf('receivables', payload, dest, 'A4', { landscape: true })
    audit.record({
      userId: opts.userId,
      action: 'export',
      summary: `Exported receivables PDF as of ${report.asOf}`,
      after: { path: dest },
    })
    if (opts.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  /**
   * Generic branded table PDF used by list/export buttons.
   * Signature kept stable for Phase 8 reports.
   */
  async function exportTable(
    input: ExportTableInput,
    opts: { userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const business = businessHeader()
    const payload = {
      kind: 'table-export' as const,
      business,
      title: input.title,
      columns: input.columns,
      rows: input.rows,
      filters: input.filters ?? [],
      generatedAt: nowIsoUtc(),
    }
    const fileName = input.fileName ?? `${slugifyName(input.title)}-${todayBusinessDate()}.pdf`
    const dest = path.join(
      miscDir('Exports'),
      fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
    )
    await writePdf('table-export', payload, dest, 'A4', {
      landscape: input.orientation === 'landscape',
    })
    audit.record({
      userId: opts.userId,
      action: 'export',
      summary: `Exported table PDF: ${input.title} (${input.rows.length} rows)`,
      after: { path: dest },
    })
    if (input.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  /** Excel export via the existing `xlsx` dependency (SheetJS). */
  async function exportExcel(
    input: ExportExcelInput,
    opts: { userId?: number | null } = {},
  ): Promise<{ path: string }> {
    const XLSX = await import('xlsx')
    const headers = input.columns.map((c) => c.header)
    const keys = input.columns.map((c) => c.key)
    const aoa: (string | number | null)[][] = [headers]
    for (const row of input.rows) {
      aoa.push(keys.map((k) => (row[k] === undefined ? null : row[k]!)))
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (input.sheetName ?? 'Sheet1').slice(0, 31))
    const fileName = input.fileName ?? `${slugifyName(input.title)}-${todayBusinessDate()}.xlsx`
    const dest = path.join(
      miscDir('Exports'),
      fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    )
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    XLSX.writeFile(wb, dest)
    audit.record({
      userId: opts.userId,
      action: 'export',
      summary: `Exported Excel: ${input.title} (${input.rows.length} rows)`,
      after: { path: dest },
    })
    if (input.openAfter) await platform.openPath(dest)
    return { path: dest }
  }

  function fillTemplate(template: string, vars: Record<string, string>): string {
    let out = template
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(v)
    }
    return out
  }

  function invoiceMessageVars(invoiceId: number): Record<string, string> {
    const inv = billing.getById(invoiceId)
    return {
      customerName: inv.customerName,
      period: inv.period ?? '',
      units: String(inv.deliveriesQty),
      amount: money(inv.invoiceTotal),
      previousBalance: money(inv.openingBalance),
      totalPayable: money(inv.totalPayable),
      dueDate: inv.dueDate ? formatDisplayDate(inv.dueDate) : '',
      businessName: settings.get('business.name') || 'Aqua Nuqi',
      invoiceNo: inv.invoiceNo,
    }
  }

  async function ensureInvoicePdf(invoiceId: number, userId?: number | null): Promise<string> {
    const inv = billing.getById(invoiceId)
    if (inv.pdfPath && fs.existsSync(inv.pdfPath)) return inv.pdfPath
    const r = await generateInvoicePdf(invoiceId, { userId })
    return r.path
  }

  async function shareWhatsApp(
    invoiceId: number,
    opts: { phoneOverride?: string; userId?: number | null } = {},
  ): Promise<{
    ok: true
    waUrl: string
    pdfPath: string | null
    phoneWarning: string | null
    e164: string | null
  }> {
    const inv = billing.getById(invoiceId)
    const customer = db.select().from(customers).where(eq(customers.id, inv.customerId)).get()
    const rawPhone = opts.phoneOverride || customer?.whatsappNumber || customer?.phonePrimary || ''
    let phoneWarning: string | null = null
    const e164 = rawPhone ? toWhatsAppE164(rawPhone) : ''
    if (!e164 || e164.length < 11) {
      phoneWarning = 'Customer phone number is missing or does not look like a valid mobile.'
    } else if (!e164.startsWith('92') || e164.length !== 12) {
      phoneWarning = 'Phone number may not be a Pakistani mobile — check before sending.'
    }

    const pdfPath = await ensureInvoicePdf(invoiceId, opts.userId)
    const text = fillTemplate(
      settings.get('invoice.whatsappTemplate'),
      invoiceMessageVars(invoiceId),
    )
    const waUrl = e164
      ? `https://wa.me/${e164}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`

    await platform.openExternal(waUrl)
    platform.showItemInFolder(pdfPath)
    platform.writeClipboard(pdfPath)

    billing.markShared([invoiceId], opts.userId)
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'invoices',
      entityId: invoiceId,
      summary: `Shared invoice ${inv.invoiceNo} via WhatsApp`,
      after: { waUrl, pdfPath },
    })

    return { ok: true, waUrl, pdfPath, phoneWarning, e164: e164 || null }
  }

  async function shareEmail(
    invoiceId: number,
    opts: { userId?: number | null } = {},
  ): Promise<{ ok: true; mailtoUrl: string; pdfPath: string | null }> {
    const inv = billing.getById(invoiceId)
    const customer = db.select().from(customers).where(eq(customers.id, inv.customerId)).get()
    const vars = invoiceMessageVars(invoiceId)
    const subject = fillTemplate(settings.get('invoice.emailSubjectTemplate'), vars)
    const body =
      fillTemplate(settings.get('invoice.emailBodyTemplate'), vars) +
      '\n\n(Attach the PDF — path copied to clipboard.)'
    const email = customer?.email ?? ''
    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    const pdfPath = await ensureInvoicePdf(invoiceId, opts.userId)
    await platform.openExternal(mailtoUrl)
    platform.writeClipboard(pdfPath)
    billing.markShared([invoiceId], opts.userId)
    audit.record({
      userId: opts.userId,
      action: 'export',
      entityTable: 'invoices',
      entityId: invoiceId,
      summary: `Shared invoice ${inv.invoiceNo} via email`,
      after: { mailtoUrl, pdfPath },
    })
    return { ok: true, mailtoUrl, pdfPath }
  }

  async function savePdfAs(
    sourcePath: string,
    defaultName?: string,
  ): Promise<{ path: string | null }> {
    if (!fs.existsSync(sourcePath)) {
      throw new AppError('NOT_FOUND', 'PDF file not found')
    }
    const dest = await platform.saveDialog({
      defaultPath: defaultName ?? path.basename(sourcePath),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!dest) return { path: null }
    fs.copyFileSync(sourcePath, dest)
    return { path: dest }
  }

  return {
    generateInvoicePdf,
    batchGenerateInvoices,
    cancelBatch,
    printInvoice,
    generateReceiptPdf,
    printReceipt,
    generateDeliverySlip,
    generateStatementPdf,
    generateDeliveryCardPdf,
    generateBottlesOutPdf,
    generateReceivablesPdf,
    exportTable,
    exportExcel,
    shareWhatsApp,
    shareEmail,
    savePdfAs,
    buildInvoicePayload,
    businessHeader,
    ensureInvoicePdf,
    documentsRoot,
    defaultReceiptVariant,
    thermalPrinterName,
  }
}

export type PdfService = ReturnType<typeof createPdfService>
