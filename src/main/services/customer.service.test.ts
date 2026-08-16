import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { auditLog, customerSchedules, ledgerEntries } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('customerService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-cust-'))
    const dbPath = path.join(dir, 'test.db')
    const { db } = openDatabase(dbPath)
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
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    return { db, customers, balances, owner, audit, period }
  }

  it('list of 1000 customers completes under 500ms', async () => {
    const { customers, owner } = await setup()
    for (let i = 0; i < 1000; i++) {
      customers.create(
        {
          name: `Bulk Cust ${i}`,
          phonePrimary: `0300${String(i).padStart(7, '0')}`,
          openingBalance: i % 5 === 0 ? Number(toPaisa(100)) : 0,
          openingBottles: i % 7 === 0 ? 2 : 0,
          openingAsOf: i % 5 === 0 || i % 7 === 0 ? '2026-07-01' : null,
          rate: Number(toPaisa(60)),
        },
        owner.id,
      )
    }

    const start = performance.now()
    const result = customers.list({
      search: 'Bulk',
      hasOutstanding: true,
      sortBy: 'balance',
      sortDir: 'desc',
      limit: 1000,
    })
    const elapsed = performance.now() - start

    expect(result.total).toBeGreaterThan(0)
    expect(result.items.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  it('editing openings voids prior ledger rows instead of hard-deleting', async () => {
    const { db, customers, owner } = await setup()
    const c = customers.create(
      {
        name: 'Opening Edit',
        openingBalance: Number(toPaisa(3500)),
        openingBottles: 4,
        openingAsOf: '2026-07-01',
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    const beforeCount = db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, c.id))
      .all().length

    customers.update(
      {
        id: c.id,
        openingBalance: Number(toPaisa(2000)),
        openingBottles: 2,
        openingAsOf: '2026-07-01',
      },
      owner.id,
    )

    const rows = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).all()
    expect(rows.length).toBeGreaterThan(beforeCount)
    expect(rows.some((r) => r.entryType === 'void_reversal')).toBe(true)
    expect(rows.filter((r) => r.entryType === 'opening_balance')).toHaveLength(2)
    expect(rows.every((r) => r.id > 0)).toBe(true)

    const updated = customers.getById(c.id)
    expect(updated.openingBalance).toBe(Number(toPaisa(2000)))
    expect(updated.balance).toBe(Number(toPaisa(2000)))
  })

  it('security deposit writes deposit_received and credits the running account (non-revenue)', async () => {
    const { db, customers, balances, owner } = await setup()
    const c = customers.create(
      {
        name: 'Deposit Cust',
        openingBalance: Number(toPaisa(1000)),
        openingAsOf: '2026-07-01',
        securityDepositHeld: Number(toPaisa(2000)),
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    const deposits = db
      .select()
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.customerId, c.id), eq(ledgerEntries.entryType, 'deposit_received')),
      )
      .all()
    expect(deposits).toHaveLength(1)
    expect(deposits[0]!.credit).toBe(Number(toPaisa(2000)))

    expect(c.securityDepositHeld).toBe(Number(toPaisa(2000)))
    // Opening 1000 − deposit credit 2000 = −1000 (customer credit). Not revenue.
    expect(c.balance).toBe(Number(toPaisa(-1000)))
    expect(balances.computeLiveBalance(c.id)).toBe(Number(toPaisa(-1000)))
  })

  it('update audit stores full before/after DTOs', async () => {
    const { db, customers, owner } = await setup()
    const c = customers.create(
      { name: 'Audit Me', phonePrimary: '03001112222', rate: Number(toPaisa(60)) },
      owner.id,
    )
    customers.update({ id: c.id, name: 'Audit Me Updated', phonePrimary: '03003334444' }, owner.id)

    const row = db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityTable, 'customers'),
          eq(auditLog.entityId, c.id),
          eq(auditLog.action, 'update'),
        ),
      )
      .all()
      .at(-1)!

    const before = JSON.parse(row.beforeJson!) as { name: string; phonePrimary: string }
    const after = JSON.parse(row.afterJson!) as { name: string; phonePrimary: string; code: string }
    expect(before.name).toBe('Audit Me')
    expect(after.name).toBe('Audit Me Updated')
    expect(after.phonePrimary).toBe('03003334444')
    expect(after.code).toBe(c.code)
  })

  it('phone-only update does not void or re-post deposit and openings', async () => {
    const { db, customers, owner } = await setup()
    const c = customers.create(
      {
        name: 'Phone Edit',
        phonePrimary: '03001112222',
        openingBalance: Number(toPaisa(0)),
        openingBottles: 2,
        openingAsOf: '2026-07-01',
        securityDepositHeld: Number(toPaisa(500)),
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )
    const before = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).all()
    expect(before.some((r) => r.entryType === 'deposit_received')).toBe(true)

    customers.update(
      {
        id: c.id,
        phonePrimary: '03009998888',
        openingBalance: c.openingBalance,
        openingBottles: c.openingBottles,
        openingAsOf: c.openingAsOf,
        securityDepositHeld: c.securityDepositHeld,
      },
      owner.id,
    )

    const after = db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, c.id)).all()
    expect(after).toHaveLength(before.length)
    expect(after.some((r) => r.entryType === 'void_reversal')).toBe(false)
    expect(after.filter((r) => r.entryType === 'deposit_received')).toHaveLength(1)
    expect(customers.getById(c.id).phonePrimary).toBe('03009998888')
    expect(customers.getById(c.id).securityDepositHeld).toBe(Number(toPaisa(500)))
  })

  it('creating a customer with zero openings is allowed in a locked month', async () => {
    const { customers, owner, period } = await setup()
    period.close('2026-08', owner.id)
    const c = customers.create(
      {
        name: 'After Lock',
        rate: Number(toPaisa(60)),
        openingAsOf: '2026-08-16',
      },
      owner.id,
    )
    expect(c.id).toBeGreaterThan(0)
    expect(c.name).toBe('After Lock')
  })

  it('creating a customer with openings in a locked month is still refused', async () => {
    const { customers, owner, period } = await setup()
    period.close('2026-08', owner.id)
    expect(() =>
      customers.create(
        {
          name: 'Opening After Lock',
          rate: Number(toPaisa(60)),
          openingBalance: Number(toPaisa(100)),
          openingAsOf: '2026-08-01',
        },
        owner.id,
      ),
    ).toThrow(/locked/)
  })

  it('export writes an export audit entry', async () => {
    const { db, customers, owner } = await setup()
    customers.create({ name: 'Export Me', rate: Number(toPaisa(60)) }, owner.id)
    customers.exportRows('csv', owner.id)

    const row = db.select().from(auditLog).where(eq(auditLog.action, 'export')).get()
    expect(row).toBeTruthy()
    expect(row!.summary).toMatch(/Exported/)
  })

  it('clearing schedule soft-deletes instead of hard-deleting', async () => {
    const { db, customers, owner } = await setup()
    const c = customers.create(
      {
        name: 'Schedule Cust',
        rate: Number(toPaisa(60)),
        schedule: { mode: 'on_call', weekdays: null, intervalDays: null, defaultQty: 2 },
      },
      owner.id,
    )
    expect(c.schedule?.mode).toBe('on_call')

    customers.update({ id: c.id, schedule: null }, owner.id)
    const cleared = customers.getById(c.id)
    expect(cleared.schedule).toBeNull()

    const rows = db
      .select()
      .from(customerSchedules)
      .where(eq(customerSchedules.customerId, c.id))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.deletedAt).not.toBeNull()
    expect(
      db.select().from(customerSchedules).where(isNull(customerSchedules.deletedAt)).all(),
    ).toHaveLength(0)
  })
})
