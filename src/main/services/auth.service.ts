import { hash, verify } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { appMeta, users } from '@main/db/schema'
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

const RECOVERY_META_KEY = 'recovery_code_hash'
/** Persisted map of username → { count, lockedUntil } so throttle survives app restart. */
const LOGIN_FAILURES_META_KEY = 'login_failures'

type FailureState = { count: number; lockedUntil: number }

export function passwordStrength(password: string): {
  score: number
  label: 'too_short' | 'weak' | 'fair' | 'good' | 'strong'
} {
  if (password.length < 8) return { score: 0, label: 'too_short' }
  let score = 1
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  score = Math.min(4, score)
  const labels = ['too_short', 'weak', 'fair', 'good', 'strong'] as const
  return { score, label: labels[score] }
}

function assertPasswordPolicy(password: string): void {
  if (password.length < 8) {
    throw new AppError('VALIDATION_FAILED', 'Password must be at least 8 characters')
  }
}

function loadLoginFailures(db: AppDatabase): Map<string, FailureState> {
  const row = db.select().from(appMeta).where(eq(appMeta.key, LOGIN_FAILURES_META_KEY)).get()
  if (!row) return new Map()
  try {
    const parsed = JSON.parse(row.value) as Record<string, FailureState>
    const map = new Map<string, FailureState>()
    for (const [key, state] of Object.entries(parsed)) {
      if (
        state &&
        typeof state.count === 'number' &&
        typeof state.lockedUntil === 'number' &&
        state.count > 0
      ) {
        map.set(key, { count: state.count, lockedUntil: state.lockedUntil })
      }
    }
    return map
  } catch {
    return new Map()
  }
}

export function createAuthService(db: AppDatabase, audit: AuditService) {
  const session: SessionState = { user: null, locked: false }
  const failures = loadLoginFailures(db)
  /** Per-user session epoch — forceLogout bumps it so stale sessions fail requireUser. */
  const sessionEpoch = new Map<number, number>()
  let activeEpoch = 0

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

  function persistFailures(): void {
    const obj: Record<string, FailureState> = {}
    for (const [key, state] of failures.entries()) {
      obj[key] = state
    }
    const value = JSON.stringify(obj)
    const existing = db.select().from(appMeta).where(eq(appMeta.key, LOGIN_FAILURES_META_KEY)).get()
    if (existing) {
      db.update(appMeta).set({ value }).where(eq(appMeta.key, LOGIN_FAILURES_META_KEY)).run()
    } else {
      db.insert(appMeta).values({ key: LOGIN_FAILURES_META_KEY, value }).run()
    }
  }

  function getSession(): SessionState {
    if (session.user) {
      const expected = sessionEpoch.get(session.user.id) ?? 0
      if (activeEpoch !== expected) {
        session.user = null
        session.locked = false
      }
    }
    return { user: session.user, locked: session.locked }
  }

  function requireUser(): UserDto {
    if (!session.user || session.locked) {
      throw new AppError('UNAUTHORIZED', 'Not authenticated')
    }
    const expected = sessionEpoch.get(session.user.id) ?? 0
    if (activeEpoch !== expected) {
      session.user = null
      session.locked = false
      throw new AppError('UNAUTHORIZED', 'Session was ended remotely')
    }
    return session.user
  }

  function countActiveOwners(excludeUserId?: number): number {
    const rows = db
      .select()
      .from(users)
      .where(and(eq(users.role, 'owner'), eq(users.isActive, 1)))
      .all()
    return rows.filter((r) => r.id !== excludeUserId).length
  }

  function guardThrottle(username: string): void {
    const state = failures.get(username.toLowerCase())
    if (!state) return
    if (state.lockedUntil > Date.now()) {
      const waitSec = Math.ceil((state.lockedUntil - Date.now()) / 1000)
      throw new AppError(
        'UNAUTHORIZED',
        `Too many failed logins. Try again in ${waitSec} second(s).`,
        { retryAfterSeconds: waitSec },
      )
    }
  }

  function recordFailure(username: string, userId: number | null): void {
    const key = username.toLowerCase()
    const prev = failures.get(key) ?? { count: 0, lockedUntil: 0 }
    const count = prev.count + 1
    // Progressive delay after 5 failures: 5s, 15s, 30s, 60s, …
    let lockedUntil = 0
    if (count >= 5) {
      const step = count - 4
      const delayMs = Math.min(60_000, 5_000 * Math.pow(2, step - 1))
      lockedUntil = Date.now() + delayMs
    }
    failures.set(key, { count, lockedUntil })
    persistFailures()
    audit.record({
      userId,
      action: 'login',
      entityTable: 'users',
      entityId: userId,
      summary: `Failed login attempt for ${username} (#${count})`,
      after: { username, failures: count },
    })
  }

  function clearFailures(username: string): void {
    failures.delete(username.toLowerCase())
    persistFailures()
  }

  async function createUser(input: {
    username: string
    displayName: string
    password: string
    role: Role
  }): Promise<UserDto> {
    assertPasswordPolicy(input.password)
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
    guardThrottle(username)
    const row = db.select().from(users).where(eq(users.username, username)).get()
    if (!row || row.isActive !== 1) {
      recordFailure(username, row?.id ?? null)
      throw new AppError('UNAUTHORIZED', 'Invalid username or password')
    }
    const ok = await verifySecret(row.passwordHash, password)
    if (!ok) {
      recordFailure(username, row.id)
      throw new AppError('UNAUTHORIZED', 'Invalid username or password')
    }
    clearFailures(username)
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
    activeEpoch = sessionEpoch.get(dto.id) ?? 0
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
    assertPasswordPolicy(newPassword)
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

  async function clearPin(userId: number): Promise<void> {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    db.transaction((tx) => {
      tx.update(users)
        .set({ pinHash: null, updatedAt: nowIsoUtc() })
        .where(eq(users.id, userId))
        .run()
      audit.record(
        {
          userId: session.user?.id ?? userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `PIN cleared for ${row.username}`,
        },
        tx,
      )
    })
    if (session.user?.id === userId) {
      session.user = { ...session.user, hasPin: false }
    }
  }

  function updateUser(userId: number, patch: { displayName?: string; role?: Role }): UserDto {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    if (patch.role && patch.role !== 'owner' && row.role === 'owner' && row.isActive === 1) {
      if (countActiveOwners(userId) < 1) {
        throw new AppError('CONFLICT', 'There must always be at least one active owner')
      }
    }
    const next = db.transaction((tx) => {
      tx.update(users)
        .set({
          displayName: patch.displayName ?? row.displayName,
          role: patch.role ?? row.role,
          updatedAt: nowIsoUtc(),
        })
        .where(eq(users.id, userId))
        .run()
      const updated = tx.select().from(users).where(eq(users.id, userId)).get()!
      audit.record(
        {
          userId: session.user?.id ?? userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `Updated user ${row.username}`,
          before: { displayName: row.displayName, role: row.role },
          after: { displayName: updated.displayName, role: updated.role },
        },
        tx,
      )
      return updated
    })
    if (session.user?.id === userId) {
      session.user = toDto(next)
    }
    return toDto(next)
  }

  function setUserActive(userId: number, isActive: boolean): UserDto {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    if (!isActive && row.role === 'owner' && row.isActive === 1) {
      if (countActiveOwners(userId) < 1) {
        throw new AppError('CONFLICT', 'There must always be at least one active owner')
      }
    }
    const next = db.transaction((tx) => {
      tx.update(users)
        .set({ isActive: isActive ? 1 : 0, updatedAt: nowIsoUtc() })
        .where(eq(users.id, userId))
        .run()
      const updated = tx.select().from(users).where(eq(users.id, userId)).get()!
      audit.record(
        {
          userId: session.user?.id ?? userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `${isActive ? 'Activated' : 'Deactivated'} user ${row.username}`,
          before: { isActive: row.isActive === 1 },
          after: { isActive },
        },
        tx,
      )
      return updated
    })
    if (!isActive && session.user?.id === userId) {
      session.user = null
      session.locked = false
    }
    return toDto(next)
  }

  async function resetPassword(userId: number, newPassword: string): Promise<void> {
    assertPasswordPolicy(newPassword)
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (!row) throw new AppError('NOT_FOUND', 'User not found')
    const passwordHash = await hashSecret(newPassword)
    db.transaction((tx) => {
      tx.update(users)
        .set({ passwordHash, updatedAt: nowIsoUtc() })
        .where(eq(users.id, userId))
        .run()
      audit.record(
        {
          userId: session.user?.id ?? userId,
          action: 'update',
          entityTable: 'users',
          entityId: userId,
          summary: `Password reset for ${row.username}`,
        },
        tx,
      )
    })
  }

  function forceLogout(userId: number): void {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    const next = (sessionEpoch.get(userId) ?? 0) + 1
    sessionEpoch.set(userId, next)
    audit.record({
      userId: session.user?.id ?? userId,
      action: 'logout',
      entityTable: 'users',
      entityId: userId,
      summary: `Forced logout for ${row?.username ?? `user #${userId}`}`,
    })
    if (session.user?.id === userId) {
      session.user = null
      session.locked = false
    }
  }

  async function generateRecoveryCode(): Promise<string> {
    const code = Array.from({ length: 4 }, () =>
      Math.random().toString(36).slice(2, 6).toUpperCase(),
    ).join('-')
    const recoveryHash = await hashSecret(code)
    const existing = db.select().from(appMeta).where(eq(appMeta.key, RECOVERY_META_KEY)).get()
    if (existing) {
      db.update(appMeta)
        .set({ value: recoveryHash })
        .where(eq(appMeta.key, RECOVERY_META_KEY))
        .run()
    } else {
      db.insert(appMeta).values({ key: RECOVERY_META_KEY, value: recoveryHash }).run()
    }
    audit.record({
      userId: session.user?.id ?? null,
      action: 'update',
      entityTable: 'app_meta',
      summary: 'Generated new owner recovery code',
    })
    return code
  }

  async function resetOwnerWithRecovery(input: {
    username: string
    recoveryCode: string
    newPassword: string
  }): Promise<UserDto> {
    assertPasswordPolicy(input.newPassword)
    const meta = db.select().from(appMeta).where(eq(appMeta.key, RECOVERY_META_KEY)).get()
    if (!meta) {
      throw new AppError(
        'NOT_FOUND',
        'No recovery code is set. Restore from a backup to recover access.',
      )
    }
    const ok = await verifySecret(meta.value, input.recoveryCode.trim())
    if (!ok) throw new AppError('UNAUTHORIZED', 'Invalid recovery code')

    const row = db.select().from(users).where(eq(users.username, input.username)).get()
    if (!row || row.role !== 'owner') {
      throw new AppError('NOT_FOUND', 'Owner user not found')
    }
    const passwordHash = await hashSecret(input.newPassword)
    const dto = db.transaction((tx) => {
      tx.update(users)
        .set({ passwordHash, isActive: 1, updatedAt: nowIsoUtc() })
        .where(eq(users.id, row.id))
        .run()
      audit.record(
        {
          userId: row.id,
          action: 'update',
          entityTable: 'users',
          entityId: row.id,
          summary: `Owner password reset via recovery code for ${row.username}`,
        },
        tx,
      )
      return toDto({ ...row, isActive: 1 })
    })
    return dto
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
    if (user) {
      activeEpoch = sessionEpoch.get(user.id) ?? 0
    }
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
    clearPin,
    updateUser,
    setUserActive,
    resetPassword,
    forceLogout,
    generateRecoveryCode,
    resetOwnerWithRecovery,
    passwordStrength,
    listUsers,
    hasAnyUser,
    setSessionUser,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
