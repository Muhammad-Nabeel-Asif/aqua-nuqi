import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isNull } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { customers } from '@main/db/schema'
import { seedDefaults } from '@main/db/seed'
import { AppError } from '@shared/errors'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerImportService } from './customer-import.service'
import { createCustomerService } from './customer.service'
import { createMasterDataService } from './master-data.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

function csvBase64(body: string): string {
  return Buffer.from(body, 'utf8').toString('base64')
}

describe('customerImportService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-imp-'))
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
    const customerService = createCustomerService(db, audit, period, rates, balances)
    const master = createMasterDataService(db, audit)
    const importer = createCustomerImportService(db, customerService, master)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    return { importer, owner, db }
  }

  it('imports nothing when rows are invalid, then succeeds after fix', async () => {
    const { importer, owner, db } = await setup()
    const header = 'name,phone,area,route,rate,opening_balance,opening_bottles,opening_as_of\n'
    const bad = [
      'Good One,03001111111,Gulberg,Morning,60,0,0,',
      ',03002222222,Gulberg,Morning,60,0,0,', // missing name
      'Bad Phone,abc,Gulberg,Morning,60,0,0,',
      'Missing AsOf,03003333333,Gulberg,Morning,60,3500,4,', // openings without as-of
    ].join('\n')

    const mapping = {
      name: 'name' as const,
      phone: 'phone' as const,
      area: 'area' as const,
      route: 'route' as const,
      rate: 'rate' as const,
      opening_balance: 'openingBalance' as const,
      opening_bottles: 'openingBottles' as const,
      opening_as_of: 'openingAsOf' as const,
    }

    const validated = importer.validate('t.csv', csvBase64(header + bad), mapping, {
      createMissingAreas: true,
      createMissingRoutes: true,
    })
    expect(validated.errorCount).toBe(3)
    expect(validated.errors.map((e) => e.row).sort()).toEqual([3, 4, 5])

    expect(() =>
      importer.commit('t.csv', csvBase64(header + bad), mapping, {
        createMissingAreas: true,
        createMissingRoutes: true,
        userId: owner.id,
      }),
    ).toThrow(AppError)

    expect(db.select().from(customers).where(isNull(customers.deletedAt)).all()).toHaveLength(0)

    const good = [
      'Good One,03001111111,Gulberg,Morning,60,0,0,',
      'Fixed Two,03002222222,Gulberg,Morning,60,0,0,',
      'Fixed Three,03003333333,Gulberg,Morning,60,3500,4,2026-07-01',
      'Good Four,03004444444,Gulberg,Morning,60,0,0,',
    ].join('\n')

    const result = importer.commit('t.csv', csvBase64(header + good), mapping, {
      createMissingAreas: true,
      createMissingRoutes: true,
      userId: owner.id,
    })
    expect(result.imported).toBe(4)
    expect(db.select().from(customers).where(isNull(customers.deletedAt)).all()).toHaveLength(4)
  })
})
