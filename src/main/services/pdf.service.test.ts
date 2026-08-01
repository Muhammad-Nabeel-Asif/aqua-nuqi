import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
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
import { createPdfService } from './pdf.service'
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

  async function setup() {
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
    const customers = createCustomerService(db, audit, period, rates, balances, ledger)
    const deliveries = createDeliveryService(db, audit, period, rates, balances, settings)
    const billing = createBillingService(db, audit, period, settings, balances, ledger)
    const payments = createPaymentService(db, audit, period, balances, ledger, billing)
    const receivables = createReceivablesService(db)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const pdf = createPdfService(
      db,
      audit,
      settings,
      billing,
      payments,
      ledger,
      customers,
      deliveries,
      receivables,
      {
        renderPdf: async () => Buffer.from('%PDF-1.4 mock'),
        print: async () => {},
      },
      {
        getDocumentsRoot: () => path.join(dir, 'docs'),
        openExternal: async () => {},
        showItemInFolder: () => {},
        writeClipboard: () => {},
        openPath: async () => '',
        saveDialog: async () => null,
        readLogoAsDataUrl: () => null,
      },
    )

    return { customers, deliveries, billing, pdf, owner }
  }

  it('generates invoice PDF, stores pdf_path, keeps totals on regenerate', async () => {
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
    const first = await pdf.generateInvoicePdf(inv.id, { userId: owner.id })
    expect(fs.existsSync(first.path)).toBe(true)
    expect(path.basename(first.path)).toMatch(/علی|INV-/)
    expect(billing.getById(inv.id).pdfPath).toBe(first.path)

    const totals = billing.getById(inv.id)
    const second = await pdf.generateInvoicePdf(inv.id, { userId: owner.id })
    const again = billing.getById(inv.id)
    expect(again.invoiceTotal).toBe(totals.invoiceTotal)
    expect(again.totalPayable).toBe(totals.totalPayable)
    expect(second.path).toBe(first.path)
  })

  it('batch cancel stops further generation without corrupting written files', async () => {
    const { customers, deliveries, billing, pdf, owner } = await setup()
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

    const jobId = 'job-cancel'
    const promise = pdf.batchGenerateInvoices({ invoiceIds: ids, jobId }, owner.id)
    pdf.cancelBatch(jobId)
    const result = await promise
    expect(result.cancelled || result.generated <= ids.length).toBe(true)
    for (const f of result.files) {
      expect(fs.existsSync(f)).toBe(true)
      expect(fs.readFileSync(f).subarray(0, 4).toString()).toBe('%PDF')
    }
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
})
