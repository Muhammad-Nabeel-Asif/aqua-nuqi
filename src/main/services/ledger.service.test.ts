import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { ledgerEntries } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createLedgerService, type LedgerEntryType } from './ledger.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('ledgerService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-ledger-'))
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
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const ledger = createLedgerService(db, balances)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const customer = customers.create({ name: 'Ledger Cust', rate: Number(toPaisa(60)) }, owner.id)
    return { db, ledger, balances, customer, owner }
  }

  it('1,000 randomly ordered entries incl. back-dated: balance_after equals naive aggregate; recalculate is no-op', async () => {
    const { db, ledger, balances, customer, owner } = await setup()
    const types: LedgerEntryType[] = [
      'invoice',
      'payment',
      'adjustment_debit',
      'adjustment_credit',
      'deposit_received',
      'deposit_refunded',
      'write_off',
    ]

    // Deterministic pseudo-random for reproducible tests
    let seed = 42
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }

    const planned: Array<{
      date: string
      type: LedgerEntryType
      debit: number
      credit: number
    }> = []

    for (let i = 0; i < 1000; i++) {
      const day = 1 + Math.floor(rand() * 28)
      const month = 1 + Math.floor(rand() * 6)
      const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const type = types[Math.floor(rand() * types.length)]!
      const amount = 100 + Math.floor(rand() * 50_000)
      const isDebit =
        type === 'invoice' ||
        type === 'adjustment_debit' ||
        type === 'deposit_refunded' ||
        (type === 'write_off' && rand() > 0.5)
      planned.push({
        date,
        type,
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
      })
    }

    // Insert in a shuffled order so many inserts are back-dated relative to existing rows
    const order = planned.map((_, i) => i).sort(() => rand() - 0.5)
    db.transaction((tx) => {
      for (const idx of order) {
        const p = planned[idx]!
        ledger.appendEntry(tx, {
          customerId: customer.id,
          date: p.date,
          type: p.type,
          debit: p.debit,
          credit: p.credit,
          description: `${p.type} #${idx}`,
          createdBy: owner.id,
        })
      }
    })

    const rows = db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, customer.id))
      .all()
      .sort((a, b) =>
        a.entryDate === b.entryDate ? a.id - b.id : a.entryDate.localeCompare(b.entryDate),
      )

    expect(rows.length).toBe(1000)

    let running = 0
    for (const row of rows) {
      running = running + row.debit - row.credit
      expect(row.balanceAfter).toBe(running)
    }

    const naive = ledger.naiveAggregate(customer.id)
    expect(rows[rows.length - 1]!.balanceAfter).toBe(naive)
    expect(ledger.getBalance(customer.id)).toBe(naive)
    expect(balances.computeLiveBalance(customer.id)).toBe(naive)

    const recalc = ledger.recalculateLedger(customer.id)
    expect(recalc.changed).toBe(0)
    expect(recalc.balance).toBe(naive)
  })

  it('back-dated insert recomputes later balance_after rows', async () => {
    const { db, ledger, customer, owner } = await setup()
    db.transaction((tx) => {
      ledger.appendEntry(tx, {
        customerId: customer.id,
        date: '2026-07-10',
        type: 'invoice',
        debit: 1000,
        credit: 0,
        description: 'July invoice',
        createdBy: owner.id,
      })
      ledger.appendEntry(tx, {
        customerId: customer.id,
        date: '2026-07-20',
        type: 'payment',
        debit: 0,
        credit: 400,
        description: 'July payment',
        createdBy: owner.id,
      })
      ledger.appendEntry(tx, {
        customerId: customer.id,
        date: '2026-07-05',
        type: 'invoice',
        debit: 500,
        credit: 0,
        description: 'Back-dated',
        createdBy: owner.id,
      })
    })

    const rows = ledger.getLedger(customer.id)
    expect(rows.map((r) => r.description)).toEqual(['Back-dated', 'July invoice', 'July payment'])
    expect(rows.map((r) => r.balanceAfter)).toEqual([500, 1500, 1100])
    expect(ledger.getBalance(customer.id)).toBe(1100)
  })

  it('reverseEntriesFor appends opposite amounts and restores prior balance', async () => {
    const { db, ledger, customer, owner } = await setup()
    db.transaction((tx) => {
      ledger.appendEntry(tx, {
        customerId: customer.id,
        date: '2026-07-01',
        type: 'opening_balance',
        debit: 3000,
        credit: 0,
        description: 'Opening',
        createdBy: owner.id,
      })
      ledger.appendEntry(tx, {
        customerId: customer.id,
        date: '2026-07-31',
        type: 'invoice',
        debit: 1200,
        credit: 0,
        description: 'Invoice INV-1',
        refTable: 'invoices',
        refId: 99,
        createdBy: owner.id,
      })
    })
    expect(ledger.getBalance(customer.id)).toBe(4200)

    db.transaction((tx) => {
      ledger.reverseEntriesFor(tx, 'invoices', 99, 'voided', owner.id)
    })

    expect(ledger.getBalance(customer.id)).toBe(3000)
    const rows = ledger.getLedger(customer.id)
    expect(rows.some((r) => r.entryType === 'void_reversal')).toBe(true)
    expect(rows.filter((r) => r.entryType === 'invoice')).toHaveLength(1)
  })
})
