import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase } from '@main/db/client'
import { AppError } from '@shared/errors'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'
import { createPeriodService } from './period.service'

describe('periodService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-period-'))
    const dbPath = path.join(dir, 'test.db')
    const { db } = openDatabase(dbPath)
    const migrationsFolder = path.join(process.cwd(), 'drizzle')
    if (fs.existsSync(migrationsFolder)) {
      migrate(db, { migrationsFolder })
    }
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('throws PERIOD_LOCKED after closing a period', async () => {
    const db = getDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)

    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    expect(period.isClosed('2026-06')).toBe(false)
    period.close('2026-06', owner.id, 'month end')
    expect(period.isClosed('2026-06')).toBe(true)

    try {
      period.guardPeriodOpen('2026-06-15')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('allows close → reopen → close again (UNIQUE period row reused)', async () => {
    const db = getDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const period = createPeriodService(db, audit)

    const owner = await auth.createUser({
      username: 'owner2',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    period.close('2026-06', owner.id, 'month end')
    expect(period.isClosed('2026-06')).toBe(true)

    period.reopen('2026-06', owner.id, 'fix back-dated bottle')
    expect(period.isClosed('2026-06')).toBe(false)
    expect(() => period.guardPeriodOpen('2026-06-15')).not.toThrow()

    period.close('2026-06', owner.id, 're-close after fix')
    expect(period.isClosed('2026-06')).toBe(true)
    expect(() => period.guardPeriodOpen('2026-06-15')).toThrow(AppError)
  })
})
