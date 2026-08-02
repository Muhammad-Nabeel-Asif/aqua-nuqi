import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase } from '@main/db/client'
import { AppError } from '@shared/errors'
import { createAuditService } from './audit.service'
import { createSettingsService } from './settings.service'

describe('settingsService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-settings-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rejects owner-only keys when allowOwnerOnly is omitted (defaults false)', () => {
    const db = getDb()
    const settings = createSettingsService(db, createAuditService(db))
    try {
      settings.setMany({ 'business.name': 'Hacked' })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('FORBIDDEN')
    }
  })

  it('allows owner-only keys when allowOwnerOnly is true', () => {
    const db = getDb()
    const settings = createSettingsService(db, createAuditService(db))
    const result = settings.setMany({ 'business.name': 'Aqua Plant' }, { allowOwnerOnly: true })
    expect(result['business.name']).toBe('Aqua Plant')
  })

  it('persists tax.rate and audit.retentionYears for Settings UI / applyRetention', () => {
    const db = getDb()
    const settings = createSettingsService(db, createAuditService(db))
    settings.setMany(
      { 'tax.enabled': true, 'tax.rate': 17, 'audit.retentionYears': 3 },
      { allowOwnerOnly: true },
    )
    expect(settings.get('tax.rate')).toBe(17)
    expect(settings.get('tax.enabled')).toBe(true)
    expect(settings.get('audit.retentionYears')).toBe(3)
  })
})
