import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import {
  appMeta,
  auditLog,
  customers,
  deliveries,
  invoices,
  paymentAllocations,
} from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createBalanceService } from '@main/services/balance.service'
import { createCustomerService } from '@main/services/customer.service'
import { createDeliveryService } from '@main/services/delivery.service'
import { createLedgerService } from '@main/services/ledger.service'
import { createPeriodService } from '@main/services/period.service'
import { createRateService } from '@main/services/rate.service'
import { createSettingsService } from '@main/services/settings.service'
import { toPaisa } from '@shared/money'
import { getBundledSchemaVersion, runBootMigrations } from './migrate'

/**
 * Simulates docs/07 §7 scenario 1 for the Phase 3 schema bump:
 * a Phase 2 database (migrations through 0004) with live rows must survive
 * boot into Phase 3 (0005 + 0006) with data intact and an app_upgrade audit.
 */
describe('Phase 2 → Phase 3 upgrade', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-upg-'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function phase2MigrationsFolder(): string {
    const src = path.join(process.cwd(), 'drizzle')
    const dest = path.join(dir, 'drizzle-phase2')
    fs.mkdirSync(path.join(dest, 'meta'), { recursive: true })
    for (const name of fs.readdirSync(src)) {
      if (name.endsWith('.sql') && !name.startsWith('0005') && !name.startsWith('0006')) {
        fs.copyFileSync(path.join(src, name), path.join(dest, name))
      }
    }
    for (const name of fs.readdirSync(path.join(src, 'meta'))) {
      if (name === '_journal.json') continue
      fs.copyFileSync(path.join(src, 'meta', name), path.join(dest, 'meta', name))
    }
    const journal = JSON.parse(
      fs.readFileSync(path.join(src, 'meta', '_journal.json'), 'utf8'),
    ) as { version: string; dialect: string; entries: Array<{ tag: string }> }
    journal.entries = journal.entries.filter(
      (e) => !e.tag.startsWith('0005') && !e.tag.startsWith('0006'),
    )
    fs.writeFileSync(path.join(dest, 'meta', '_journal.json'), JSON.stringify(journal, null, 2))
    return dest
  }

  it('keeps customers/deliveries, applies billing tables, writes app_upgrade', async () => {
    const dbPath = path.join(dir, 'data', 'aqua-nuqi.db')
    const backupsDir = path.join(dir, 'backups')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.mkdirSync(backupsDir, { recursive: true })

    const phase2Folder = phase2MigrationsFolder()
    expect(getBundledSchemaVersion(phase2Folder)).toBe(5) // 0000..0004 → schema 5

    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: phase2Folder })
    seedDefaults(db, backupsDir)
    db.insert(appMeta).values({ key: 'schema_version', value: '5' }).run()
    db.insert(appMeta).values({ key: 'app_version', value: '0.4.25' }).run()

    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const settings = createSettingsService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, getRawDb())
    const ledger = createLedgerService(db, balances)
    const customersSvc = createCustomerService(db, audit, period, rates, balances, ledger)
    const deliveriesSvc = createDeliveryService(db, audit, period, rates, balances, settings)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const customer = customersSvc.create(
      { name: 'Upgrade Cust', rate: Number(toPaisa(60)), joinedOn: '2026-06-01' },
      owner.id,
    )
    const delivery = deliveriesSvc.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 7,
      userId: owner.id,
    })
    closeDatabase()

    const fullFolder = path.join(process.cwd(), 'drizzle')
    const bundledMax = getBundledSchemaVersion(fullFolder)
    expect(bundledMax).toBe(7) // through 0006

    const outcome = runBootMigrations({
      paths: {
        userData: dir,
        dbDir: path.dirname(dbPath),
        dbPath,
        backupsDir,
        logsDir: path.join(dir, 'logs'),
        configPath: path.join(dir, 'config.json'),
        installDir: dir,
        resourcesPath: dir,
      },
      migrationsFolder: fullFolder,
      appVersion: '0.5.29',
    })
    expect(outcome.kind).toBe('migrated')
    if (outcome.kind === 'migrated') {
      expect(outcome.from).toBe(5)
      expect(outcome.to).toBe(7)
      expect(fs.existsSync(outcome.backupPath)).toBe(true)
    }

    const live = getDb()
    const cust = live.select().from(customers).where(eq(customers.id, customer.id)).get()
    expect(cust?.name).toBe('Upgrade Cust')
    const del = live.select().from(deliveries).where(eq(deliveries.id, delivery.id)).get()
    expect(del?.quantity).toBe(7)

    // Phase 3 tables exist
    expect(live.select().from(invoices).all()).toEqual([])
    expect(live.select().from(paymentAllocations).all()).toEqual([])

    const schema = live.select().from(appMeta).where(eq(appMeta.key, 'schema_version')).get()?.value
    expect(schema).toBe('7')
    const appVer = live.select().from(appMeta).where(eq(appMeta.key, 'app_version')).get()?.value
    expect(appVer).toBe('0.5.29')

    const upgradeAudit = live
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'app_upgrade')
    expect(upgradeAudit?.summary).toMatch(/0\.4\.25 → 0\.5\.29/)
    expect(upgradeAudit?.summary).toMatch(/schema 5 → 7/)
  })
})
