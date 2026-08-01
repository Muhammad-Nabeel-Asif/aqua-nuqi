/**
 * docs/07 §7 scenario 1 for Phase 4 (no schema bump):
 * a 0.6.33 DB with customer + issued invoice must survive boot as 0.6.35 (up_to_date).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { getBundledSchemaVersion, runBootMigrations } from '@main/db/migrate'
import { appMeta, customers, invoices } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createBalanceService } from '@main/services/balance.service'
import { createBillingService } from '@main/services/billing.service'
import { createCustomerService } from '@main/services/customer.service'
import { createDeliveryService } from '@main/services/delivery.service'
import { createLedgerService } from '@main/services/ledger.service'
import { createPeriodService } from '@main/services/period.service'
import { createRateService } from '@main/services/rate.service'
import { createSettingsService } from '@main/services/settings.service'
import { toPaisa } from '@shared/money'

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-p4-upg-'))
  const dbPath = path.join(dir, 'data', 'aqua-nuqi.db')
  const backupsDir = path.join(dir, 'backups')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.mkdirSync(backupsDir, { recursive: true })
  const migrationsFolder = path.join(process.cwd(), 'drizzle')
  const schema = getBundledSchemaVersion(migrationsFolder)
  if (schema !== 7) throw new Error(`Expected schema 7, got ${schema}`)

  const { db } = openDatabase(dbPath)
  migrate(db, { migrationsFolder })
  seedDefaults(db, backupsDir)
  db.insert(appMeta).values({ key: 'schema_version', value: '7' }).run()
  db.insert(appMeta).values({ key: 'app_version', value: '0.6.33' }).run()

  const audit = createAuditService(db)
  const auth = createAuthService(db, audit)
  const period = createPeriodService(db, audit)
  const settings = createSettingsService(db, audit)
  const rates = createRateService(db, audit, period)
  const balances = createBalanceService(db, getRawDb())
  const ledger = createLedgerService(db, balances)
  const customersSvc = createCustomerService(db, audit, period, rates, balances, ledger)
  const deliveriesSvc = createDeliveryService(db, audit, period, rates, balances, settings)
  const billing = createBillingService(db, audit, period, settings, balances, ledger)
  const owner = await auth.createUser({
    username: 'owner',
    displayName: 'Owner',
    password: 'secret12',
    role: 'owner',
  })
  const c = customersSvc.create(
    { name: 'Phase4 Upgrade Cust', rate: Number(toPaisa(60)) },
    owner.id,
  )
  deliveriesSvc.upsertDelivery({
    customerId: c.id,
    date: '2026-07-01',
    quantity: 3,
    userId: owner.id,
  })
  const inv = billing.generateInvoice(c.id, '2026-07', {}, owner.id)
  billing.issueInvoice(inv.id, owner.id)
  const marker = {
    customerId: c.id,
    invoiceId: inv.id,
    invoiceNo: inv.invoiceNo,
    totalPayable: inv.totalPayable,
  }
  closeDatabase()

  const outcome = runBootMigrations({
    paths: {
      userData: dir,
      dbDir: path.dirname(dbPath),
      dbPath,
      backupsDir,
      logsDir: path.join(dir, 'logs'),
      configPath: path.join(dir, 'config.json'),
      installDir: process.cwd(),
      resourcesPath: process.cwd(),
    },
    migrationsFolder,
    appVersion: '0.6.35',
  })

  const live = getDb()
  const cust = live.select().from(customers).where(eq(customers.id, marker.customerId)).get()
  const invRow = live.select().from(invoices).where(eq(invoices.id, marker.invoiceId)).get()
  const schemaVer = live
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, 'schema_version'))
    .get()?.value
  const appVer = live.select().from(appMeta).where(eq(appMeta.key, 'app_version')).get()?.value

  const result = {
    outcome,
    schemaVer,
    appVerStored: appVer,
    customerPresent: !!cust && cust.name === 'Phase4 Upgrade Cust',
    invoicePresent:
      !!invRow &&
      invRow.invoiceNo === marker.invoiceNo &&
      invRow.totalPayable === marker.totalPayable,
  }
  console.log(JSON.stringify(result, null, 2))

  if (outcome.kind !== 'up_to_date') throw new Error(`Expected up_to_date, got ${outcome.kind}`)
  if (!result.customerPresent || !result.invoicePresent) {
    throw new Error('Customer/invoice missing after upgrade boot')
  }
  if (schemaVer !== '7') throw new Error(`Schema drifted: ${schemaVer}`)
  closeDatabase()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('Phase 4 upgrade smoke PASS (0.6.33 → 0.6.35, schema 7, data intact)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
