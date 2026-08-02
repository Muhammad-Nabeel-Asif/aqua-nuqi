import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase } from '@main/db/client'
import { AppError } from '@shared/errors'
import { createAuditService } from './audit.service'
import { createAuthService } from './auth.service'

describe('authService', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-auth-'))
    const { db } = openDatabase(path.join(dir, 'test.db'))
    const migrationsFolder = path.join(process.cwd(), 'drizzle')
    if (fs.existsSync(migrationsFolder)) {
      migrate(db, { migrationsFolder })
    }
  })

  afterEach(() => {
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates a user, logs in, and rejects a wrong password', async () => {
    const db = getDb()
    const auth = createAuthService(db, createAuditService(db))

    await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    const user = await auth.login('owner', 'secret12')
    expect(user.username).toBe('owner')
    expect(auth.getSession().user?.id).toBe(user.id)

    await expect(auth.login('owner', 'wrong')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<AppError>)
  })

  it('throttles after five failed logins and refuses to deactivate the last owner', async () => {
    const db = getDb()
    const auth = createAuthService(db, createAuditService(db))
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })

    for (let i = 0; i < 5; i++) {
      await expect(auth.login('owner', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    await expect(auth.login('owner', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    expect(() => auth.setUserActive(owner.id, false)).toThrow(AppError)
    expect(() => auth.setUserActive(owner.id, false)).toThrow(/at least one active owner/i)
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const db = getDb()
    const auth = createAuthService(db, createAuditService(db))
    await expect(
      auth.createUser({
        username: 'short',
        displayName: 'Short',
        password: 'short',
        role: 'operator',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
