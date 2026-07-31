import { hash, verify } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { users } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type { Role } from '@shared/constants'
import type { UserDto } from '@shared/contracts'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'

export type SessionState = {
  user: UserDto | null
  locked: boolean
}

function toDto(row: typeof users.$inferSelect): UserDto {
  return {
    id: row.id,
    uuid: row.uuid,
    username: row.username,
    displayName: row.displayName,
    role: row.role as Role,
    isActive: row.isActive === 1,
    hasPin: Boolean(row.pinHash),
    lastLoginAt: row.lastLoginAt,
  }
}

const argonOpts = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export function createAuthService(db: AppDatabase, audit: AuditService) {
  const session: SessionState = { user: null, locked: false }

  async function hashSecret(value: string): Promise<string> {
    return hash(value, argonOpts)
  }

  async function verifySecret(hashed: string, value: string): Promise<boolean> {
    try {
      return await verify(hashed, value, argonOpts)
    } catch {
      return false
    }
  }

  function getSession(): SessionState {
    return { user: session.user, locked: session.locked }
  }

  function requireUser(): UserDto {
    if (!session.user || session.locked) {
      throw new AppError('UNAUTHORIZED', 'Not authenticated')
    }
    return session.user
  }

  async function createUser(input: {
    username: string
    displayName: string
    password: string
    role: Role
  }): Promise<UserDto> {
    const existing = db.select().from(users).where(eq(users.username, input.username)).get()
    if (existing) {
      throw new AppError('CONFLICT', `Username "${input.username}" already exists`)
    }
    const now = nowIsoUtc()
    const passwordHash = await hashSecret(input.password)
    const row = db.transaction((tx) => {
      const result = tx
        .insert(users)
        .values({
          uuid: newUuid(),
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          pinHash: null,
          role: input.role,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const created = tx
        .select()
        .from(users)
        .where(eq(users.id, Number(result.lastInsertRowid)))
        .get()
      if (!created) throw new AppError('INTERNAL', 'Failed to create user')

      audit.record(
        {
          userId: session.user?.id ?? created.id,
          action: 'create',
          entityTable: 'users',
          entityId: created.id,
          summary: `Created user ${created.username} (${created.role})`,
          after: { username: created.username, role: created.role },
        },
        tx,
      )
      return created
    })

    return toDto(row)
  }

  async function login(username: string, password: string): Promise<UserDto> {
    const row = db.select().from(users).where(eq(users.username, username)).get()
    if (!row || row.isActive !== 1) {
      throw new AppError('UNAUTHORIZED', 'Invalid username or password')
    }
    const ok = await verifySecret(row.passwordHash, password)
    if (!ok) {
      throw new AppError('UNAUTHORIZED', 'Invalid username or password')
    }
    const now = nowIsoUtc()
    const dto = db.transaction((tx) => {
      tx.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, row.id)).run()
      const loggedIn = toDto({ ...row, lastLoginAt: now })
      audit.record(
        {
          userId: loggedIn.id,
          action: 'login',
          entityTable: 'users',
          entityId: loggedIn.id,
          summary: `User ${loggedIn.username} logged in`,
        },
        tx,
      )
      return loggedIn
    })
    session.user = dto
    session.locked = false
    return dto
  }

  function logout(): void {
    const user = session.user
    if (user) {
      audit.record({
        userId: user.id,
        action: 'logout',
        entityTable: 'users',
        entityId: user.id,
        summary: `User ${user.username} logged out`,
      })
    }
    session.user = null
    session.locked = false
  }

  function lock(): void {
    if (session.user) session.locked = true
  }

  async function unlock(input: { password?: string; pin?: string }): Promise<void> {
    if (!session.user) {
      throw new AppError('UNAUTHORIZED', 'Not authenticated')
    }
    const row = db.select().from(users).where(eq(users.id, session.user.id)).get()
    if (!row) throw new AppError('UNAUTHORIZED', 'Not authenticated')

    if (input.pin) {
      if (!row.pinHash) throw new AppError('VALIDATION_FAILED', 'PIN is not set')
      const ok = await verifySecret(row.pinHash, input.pin)
      if (!ok) throw new AppError('UNAUTHORIZED', 'Incorrect PIN')
    } else if (input.password) {
      const ok = await verifySecret(row.passwordHash, input.password)
      if (!ok) throw new AppError('UNAUTHORIZED', 'Incorrect password')
    } else {
      throw new AppError('VALIDATION_FAILED', 'Password or PIN required')
    }
    session.locked = false
  }

  async function changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    const ok = await verifySecret(row.passwordHash, currentPassword)
    if (!ok) throw new AppError('UNAUTHORIZED', 'Current password is incorrect')
    const passwordHash = await hashSecret(newPassword)
    db.transaction((tx) => {
      tx.update(users)
        .set({ passwordHash, updatedAt: nowIsoUtc() })
        .where(eq(users.id, userId))
        .run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `Password changed for ${row.username}`,
        },
        tx,
      )
    })
  }

  async function setPin(userId: number, pin: string, password: string): Promise<void> {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    const ok = await verifySecret(row.passwordHash, password)
    if (!ok) throw new AppError('UNAUTHORIZED', 'Password is incorrect')
    const pinHash = await hashSecret(pin)
    db.transaction((tx) => {
      tx.update(users).set({ pinHash, updatedAt: nowIsoUtc() }).where(eq(users.id, userId)).run()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `PIN set for ${row.username}`,
        },
        tx,
      )
    })
    if (session.user?.id === userId) {
      session.user = { ...session.user, hasPin: true }
    }
  }

  function listUsers(): UserDto[] {
    return db.select().from(users).all().map(toDto)
  }

  function hasAnyUser(): boolean {
    return Boolean(db.select().from(users).get())
  }

  function setSessionUser(user: UserDto | null): void {
    session.user = user
    session.locked = false
  }

  return {
    getSession,
    requireUser,
    createUser,
    login,
    logout,
    lock,
    unlock,
    changePassword,
    setPin,
    listUsers,
    hasAnyUser,
    setSessionUser,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
