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
})
