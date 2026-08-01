import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { customers as customersTable } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createBillingService } from './billing.service'
import { createCustomerService } from './customer.service'
import { createDeliveryService } from './delivery.service'
import { createLedgerService } from './ledger.service'
import { createPaymentService } from './payment.service'
import { createPdfService, type PdfRenderer } from './pdf.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'
import { createReceivablesService } from './receivables.service'
import { createSettingsService } from './settings.service'

describe('pdfService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-pdf-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(dir, 'backups'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function setup(rendererOverrides?: Partial<PdfRenderer>) {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const settings = createSettingsService(db, audit)
    settings.setMany(
      { 'business.name': 'Aqua Nuqi', 'documents.folder': path.join(dir, 'docs') },
      { userId: null, allowOwnerOnly: true },
    )
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const ledger = createLedgerService(db, balances)
    const customersSvc = createCustomerService(db, audit, period, rates, balances, ledger)
    const deliveriesSvc = createDeliveryService(db, audit, period, rates, balances, settings)
    const billing = createBillingService(db, audit, period, settings, balances, ledger)
    const payments = createPaymentService(db, audit, period, balances, ledger, billing)
    const receivables = createReceivablesService(db)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const printCalls: Array<{ template: string; deviceName?: string; pageSize: unknown }> = []
    const pdf = createPdfService(
      db,
      audit,
      settings,
      billing,
      payments,
      ledger,
      customersSvc,
      deliveriesSvc,
      receivables,
      {
        renderPdf: async (opts) => {
          if (rendererOverrides?.renderPdf) return rendererOverrides.renderPdf(opts)
          return Buffer.from('%PDF-1.4 mock')
        },
        print: async (opts) => {
          printCalls.push({
            template: opts.template,
            deviceName: opts.deviceName,
            pageSize: opts.pageSize,
          })
          if (rendererOverrides?.print) await rendererOverrides.print(opts)
        },
      },
      {
        getDocumentsRoot: () => path.join(dir, 'docs'),
        openExternal: async () => {},
        showItemInFolder: () => {},
        writeClipboard: () => {},
        openPath: async () => '',
        saveDialog: async () => null,
        readLogoAsDataUrl: () => 'data:image/png;base64,AA==',
      },
    )

    return {
      db,
      customers: customersSvc,
      deliveries: deliveriesSvc,
      billing,
      payments,
      pdf,
      owner,
      settings,
      printCalls,
    }
  }

  it('generates invoice PDF, stores pdf_path, keeps totals on regenerate after rate change', async () => {
    const { customers, deliveries, billing, pdf, owner } = await setup()
    const c = customers.create({ name: 'علی خان', rate: Number(toPaisa(60)) }, owner.id)
    for (let day = 1; day <= 5; day++) {
      deliveries.upsertDelivery({
        customerId: c.id,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        quantity: 2,
        userId: owner.id,
      })
    }
    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    billing.issueInvoice(inv.id, owner.id)
    const first = await pdf.generateInvoicePdf(inv.id, { userId: owner.id })
    expect(fs.existsSync(first.path)).toBe(true)
    expect(billing.getById(inv.id).pdfPath).toBe(first.path)

    const totals = billing.getById(inv.id)
    const lineSnapshot = totals.lines.map((l) => ({
      rate: l.rate,
      amount: l.amount,
      quantity: l.quantity,
    }))
    // Regenerating must keep snapshotted line rates/amounts (acceptance #6).
    const second = await pdf.generateInvoicePdf(inv.id, { userId: owner.id })
    const again = billing.getById(inv.id)
    expect(again.invoiceTotal).toBe(totals.invoiceTotal)
    expect(again.totalPayable).toBe(totals.totalPayable)
    expect(
      again.lines.map((l) => ({ rate: l.rate, amount: l.amount, quantity: l.quantity })),
    ).toEqual(lineSnapshot)
    expect(second.path).toBe(first.path)
    const payload = pdf.buildInvoicePayload(inv.id)
    expect(payload.invoice.invoiceTotal).toBe(totals.invoiceTotal)
    expect(payload.invoice.lines.map((l) => l.amount)).toEqual(totals.lines.map((l) => l.amount))
  })

  it('issued invoice PDF empties/deposit ignore later live changes', async () => {
    const { db, customers, deliveries, billing, pdf, owner } = await setup()
    const c = customers.create(
      {
        name: 'Snapshot Cust',
        rate: Number(toPaisa(60)),
        securityDepositHeld: Number(toPaisa(2000)),
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 4,
      emptiesCollected: 3,
      userId: owner.id,
    })
    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    billing.issueInvoice(inv.id, owner.id)

    const before = pdf.buildInvoicePayload(inv.id)
    expect(before.emptiesReturned).toBe(3)
    expect(before.customer.securityDepositHeld).toBe(Number(toPaisa(2000)))

    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-08-05',
      quantity: 0,
      emptiesCollected: 10,
      userId: owner.id,
    })
    db.update(customersTable)
      .set({ securityDepositHeld: Number(toPaisa(9000)) })
      .where(eq(customersTable.id, c.id))
      .run()

    const after = pdf.buildInvoicePayload(inv.id)
    expect(after.emptiesReturned).toBe(3)
    expect(after.customer.securityDepositHeld).toBe(Number(toPaisa(2000)))
  })

  it('receipt PDF uses ledger balance_after for that payment id', async () => {
    let captured: number | null = null
    const { customers, deliveries, billing, payments, pdf, owner } = await setup({
      renderPdf: async (opts) => {
        const payload = opts.payload as { balanceAfter?: number }
        if (typeof payload.balanceAfter === 'number') captured = payload.balanceAfter
        return Buffer.from('%PDF-1.4 mock')
      },
    })
    const c = customers.create({ name: 'Pay Cust', rate: Number(toPaisa(60)) }, owner.id)
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 10,
      userId: owner.id,
    })
    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    billing.issueInvoice(inv.id, owner.id)
    const due = billing.getById(inv.id).totalPayable
    const pay1 = payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-01',
        amount: Number(toPaisa(200)),
        method: 'cash',
      },
      owner.id,
    )
    const afterPay1 = due - Number(toPaisa(200))
    payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-15',
        amount: Number(toPaisa(50)),
        method: 'cash',
      },
      owner.id,
    )
    expect(customers.getById(c.id).balance).toBe(due - Number(toPaisa(250)))

    await pdf.generateReceiptPdf(pay1.id, 'a5', { userId: owner.id })
    expect(captured).toBe(afterPay1)
  })

  it('batch cancel with slow renderer stops mid-way and leaves valid files', async () => {
    const { customers, deliveries, billing, pdf, owner } = await setup({
      renderPdf: async () => {
        await new Promise((r) => setTimeout(r, 40))
        return Buffer.from('%PDF-1.4 mock')
      },
    })
    const ids: number[] = []
    for (let i = 0; i < 8; i++) {
      const c = customers.create({ name: `Batch ${i}`, rate: Number(toPaisa(60)) }, owner.id)
      deliveries.upsertDelivery({
        customerId: c.id,
        date: '2026-07-01',
        quantity: 1,
        userId: owner.id,
      })
      ids.push(billing.generateInvoice(c.id, '2026-07', {}, owner.id).id)
    }

    const jobId = 'job-cancel-slow'
    const promise = pdf.batchGenerateInvoices({ invoiceIds: ids, jobId }, owner.id)
    await new Promise((r) => setTimeout(r, 50))
    pdf.cancelBatch(jobId)
    const result = await promise
    expect(result.cancelled).toBe(true)
    expect(result.generated).toBeGreaterThan(0)
    expect(result.generated).toBeLessThan(ids.length)
    for (const f of result.files) {
      expect(fs.existsSync(f)).toBe(true)
      expect(fs.readFileSync(f).subarray(0, 4).toString()).toBe('%PDF')
    }
  })

  it('default receipt variant and thermal printer come from settings', async () => {
    const { customers, deliveries, billing, payments, pdf, owner, settings, printCalls } =
      await setup()
    settings.setMany(
      {
        'invoice.defaultPageSize': 'thermal',
        'print.defaultThermalPrinter': 'EPSON-TM-T20',
      },
      { userId: owner.id, allowOwnerOnly: true },
    )
    expect(pdf.defaultReceiptVariant()).toBe('thermal')
    expect(pdf.thermalPrinterName()).toBe('EPSON-TM-T20')

    const c = customers.create({ name: 'Thermal', rate: Number(toPaisa(60)) }, owner.id)
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 1,
      userId: owner.id,
    })
    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    billing.issueInvoice(inv.id, owner.id)
    const pay = payments.recordPayment(
      {
        customerId: c.id,
        date: '2026-08-01',
        amount: Number(toPaisa(60)),
        method: 'cash',
      },
      owner.id,
    )

    await pdf.printReceipt(pay.id, undefined, { silent: true })
    expect(printCalls.length).toBe(1)
    expect(printCalls[0]!.template).toBe('payment-receipt-thermal')
    expect(printCalls[0]!.deviceName).toBe('EPSON-TM-T20')
  })

  it('exportTable and exportExcel write branded/export files', async () => {
    const { pdf } = await setup()
    const table = await pdf.exportTable({
      title: 'Demo export',
      columns: [
        { key: 'code', header: 'Code' },
        { key: 'qty', header: 'Qty', align: 'right' },
      ],
      rows: [
        { code: 'A', qty: 1 },
        { code: 'B', qty: 2 },
      ],
    })
    expect(fs.existsSync(table.path)).toBe(true)

    const xlsx = await pdf.exportExcel({
      title: 'Demo excel',
      columns: [
        { key: 'code', header: 'Code' },
        { key: 'qty', header: 'Qty' },
      ],
      rows: [{ code: 'A', qty: 1 }],
    })
    expect(xlsx.path.endsWith('.xlsx')).toBe(true)
    expect(fs.existsSync(xlsx.path)).toBe(true)
  })

  it('buildInvoicePayload includes logo, phones, address, amountInWords (WYSIWYG)', async () => {
    const { customers, deliveries, billing, pdf, owner, settings } = await setup()
    settings.setMany(
      { 'business.logoPath': path.join(dir, 'logo.png') },
      { userId: owner.id, allowOwnerOnly: true },
    )
    const c = customers.create(
      {
        name: 'Preview',
        rate: Number(toPaisa(60)),
        phonePrimary: '03001112233',
        addressLine: 'Gulberg',
      },
      owner.id,
    )
    deliveries.upsertDelivery({
      customerId: c.id,
      date: '2026-07-01',
      quantity: 2,
      userId: owner.id,
    })
    const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
    const payload = pdf.buildInvoicePayload(inv.id)
    expect(payload.business.logoDataUrl).toBeTruthy()
    expect(payload.customer.phonePrimary).toBe('03001112233')
    expect(payload.customer.addressLine).toBe('Gulberg')
    expect(payload.amountInWords.length).toBeGreaterThan(5)
    expect(payload.amountInWords).toMatch(/Rupees/i)
  })
})
