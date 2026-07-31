import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import { seedDefaults } from '@main/db/seed'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createBalanceService } from './balance.service'
import { createCustomerService } from './customer.service'
import { createMasterDataService } from './master-data.service'
import { createPeriodService } from './period.service'
import { createRateService } from './rate.service'

describe('masterDataService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-md-'))
    const dbPath = path.join(dir, 'test.db')
    const { db } = openDatabase(dbPath)
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    seedDefaults(db, path.join(dir, 'backups'))
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('blocks deactivating an area used by active customers', async () => {
    const db = getDb()
    const raw = getRawDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)
    const rates = createRateService(db, audit, period)
    const balances = createBalanceService(db, raw)
    const master = createMasterDataService(db, audit)
    const customers = createCustomerService(db, audit, period, rates, balances)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const area = master.createArea({ name: 'Gulberg' }, owner.id)
    customers.create(
      {
        name: 'Active Cust',
        areaId: area.id,
        rate: Number(toPaisa(60)),
      },
      owner.id,
    )

    try {
      master.updateArea({ id: area.id, isActive: false }, owner.id)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('CONFLICT')
      expect((err as AppError).message).toContain('active customer')
    }
  })
})
