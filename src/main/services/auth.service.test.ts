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

  it('throttles with retryAfterSeconds after five failed logins', async () => {
    const db = getDb()
    const auth = createAuthService(db, createAuditService(db))
    await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    for (let i = 0; i < 5; i++) {
      await expect(auth.login('owner', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    try {
      await auth.login('owner', 'wrong')
      expect.unreachable('expected throttle')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).message).toMatch(/try again in \d+ second/i)
      expect((err as AppError).details).toMatchObject({
        retryAfterSeconds: expect.any(Number),
      })
    }
  })

  it('persists failed-login throttle across auth service recreation (app restart)', async () => {
    const db = getDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    for (let i = 0; i < 5; i++) {
      await expect(auth.login('owner', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }

    // Simulate process restart: new AuthService reads app_meta.login_failures
    const authAfterRestart = createAuthService(db, audit)
    try {
      await authAfterRestart.login('owner', 'wrong')
      expect.unreachable('expected throttle after restart')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).message).toMatch(/try again in \d+ second/i)
      expect((err as AppError).details).toMatchObject({
        retryAfterSeconds: expect.any(Number),
      })
    }
  })

  it('forceLogout clears the current user and does not clear a different logged-in owner', async () => {
    const db = getDb()
    const audit = createAuditService(db)
    const auth = createAuthService(db, audit)
    const owner = await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    const op = await auth.createUser({
      username: 'driver',
      displayName: 'Driver',
      password: 'secret12',
      role: 'operator',
    })

    await auth.login('driver', 'secret12')
    auth.forceLogout(op.id)
    expect(auth.getSession().user).toBeNull()
    expect(() => auth.requireUser()).toThrow(/not authenticated|ended remotely/i)

    await auth.login('owner', 'secret12')
    auth.forceLogout(op.id)
    expect(auth.getSession().user?.id).toBe(owner.id)
    expect(auth.requireUser().id).toBe(owner.id)

    const entries = audit.list({ search: 'Forced logout', limit: 20 })
    expect(entries.items.some((e) => e.summary.includes('driver'))).toBe(true)
  })

  it('lock/unlock with password and PIN; recovery code resets the owner', async () => {
    const db = getDb()
    const auth = createAuthService(db, createAuditService(db))
    await auth.createUser({
      username: 'owner',
      displayName: 'Owner',
      password: 'secret12',
      role: 'owner',
    })
    await auth.login('owner', 'secret12')
    expect(auth.getSession().locked).toBe(false)

    auth.lock()
    expect(auth.getSession().locked).toBe(true)
    await expect(auth.unlock({ password: 'wrongpass' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await auth.unlock({ password: 'secret12' })
    expect(auth.getSession().locked).toBe(false)

    await auth.setPin(auth.getSession().user!.id, '1234', 'secret12')
    auth.lock()
    await auth.unlock({ pin: '1234' })
    expect(auth.getSession().locked).toBe(false)

    const code = await auth.generateRecoveryCode()
    expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
    const reset = await auth.resetOwnerWithRecovery({
      username: 'owner',
      recoveryCode: code,
      newPassword: 'newsecret',
    })
    expect(reset.username).toBe('owner')
    await expect(auth.login('owner', 'secret12')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const user = await auth.login('owner', 'newsecret')
    expect(user.username).toBe('owner')
  })
})
