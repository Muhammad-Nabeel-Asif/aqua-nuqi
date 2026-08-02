import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase } from '@main/db/client'
import { createAuditService } from '../services/audit.service'
import {
  clearPendingRestoreIntent,
  consumePendingRestoreAudit,
  finalizeRestoreAuditAfterSuccess,
} from './pending-restore'

describe('pending-restore helpers', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-pending-restore-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('finalizeRestoreAuditAfterSuccess deletes intent before recording audit', () => {
    const intentPath = path.join(dir, 'pending-restore.json')
    const intent = {
      from: '/tmp/backup.zip',
      preRestorePath: '/tmp/pre_restore.zip',
      at: '2026-08-02T00:00:00.000Z',
      userId: null as number | null,
    }
    fs.writeFileSync(intentPath, JSON.stringify(intent), 'utf8')

    const order: string[] = []
    finalizeRestoreAuditAfterSuccess({
      intentPath,
      intent,
      record: () => {
        order.push('record')
        expect(fs.existsSync(intentPath)).toBe(false)
      },
    })
    expect(order).toEqual(['record'])
    expect(fs.existsSync(intentPath)).toBe(false)

    // Boot consume is a no-op — no second audit path if process dies after success.
    const audit = createAuditService(getDb())
    expect(consumePendingRestoreAudit(dir, audit)).toBe(false)
    expect(audit.list({ action: 'restore', limit: 10 }).items).toHaveLength(0)
  })

  it('finalizeRestoreAuditAfterSuccess rewrites intent when audit.record fails', () => {
    const intentPath = path.join(dir, 'pending-restore.json')
    const intent = {
      from: '/tmp/backup.zip',
      preRestorePath: '/tmp/pre_restore.zip',
      at: '2026-08-02T00:00:00.000Z',
      userId: null as number | null,
    }
    fs.writeFileSync(intentPath, JSON.stringify(intent), 'utf8')

    expect(() =>
      finalizeRestoreAuditAfterSuccess({
        intentPath,
        intent,
        record: () => {
          throw new Error('audit write failed')
        },
      }),
    ).toThrow(/audit write failed/)

    expect(fs.existsSync(intentPath)).toBe(true)
    const rewritten = JSON.parse(fs.readFileSync(intentPath, 'utf8')) as typeof intent
    expect(rewritten.from).toBe(intent.from)
    expect(rewritten.preRestorePath).toBe(intent.preRestorePath)
  })

  it('consumePendingRestoreAudit appends a restore audit and deletes the intent', () => {
    const intentPath = path.join(dir, 'pending-restore.json')
    fs.writeFileSync(
      intentPath,
      JSON.stringify({
        from: '/tmp/backup.zip',
        preRestorePath: '/tmp/pre_restore.zip',
        at: '2026-08-02T00:00:00.000Z',
        userId: null,
      }),
      'utf8',
    )

    const audit = createAuditService(getDb())
    const consumed = consumePendingRestoreAudit(dir, audit)
    expect(consumed).toBe(true)
    expect(fs.existsSync(intentPath)).toBe(false)

    const listed = audit.list({ action: 'restore', limit: 10 })
    expect(listed.items.some((e) => e.summary.includes('finalized after restart'))).toBe(true)
  })

  it('consumePendingRestoreAudit is a no-op when pending-restore.json is absent', () => {
    const audit = createAuditService(getDb())
    expect(consumePendingRestoreAudit(dir, audit)).toBe(false)
  })

  it('clearPendingRestoreIntent prevents a false restore audit after a failed restore', () => {
    const intentPath = path.join(dir, 'pending-restore.json')
    fs.writeFileSync(
      intentPath,
      JSON.stringify({
        from: '/tmp/backup.zip',
        preRestorePath: '/tmp/pre_restore.zip',
        at: '2026-08-02T00:00:00.000Z',
        userId: null,
      }),
      'utf8',
    )

    // Simulate restore catch: roll back data, clear intent
    clearPendingRestoreIntent(intentPath)
    expect(fs.existsSync(intentPath)).toBe(false)

    const audit = createAuditService(getDb())
    expect(consumePendingRestoreAudit(dir, audit)).toBe(false)
    expect(audit.list({ action: 'restore', limit: 10 }).items).toHaveLength(0)
  })
})
