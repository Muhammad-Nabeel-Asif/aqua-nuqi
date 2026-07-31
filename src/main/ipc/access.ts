import type { Role } from '@shared/constants'
import { AppError } from '@shared/errors'

export type SessionLike = {
  user: { id: number; role: Role } | null
  locked: boolean
}

/**
 * Resolve caller identity for an IPC handler role policy.
 * Pure helper — unit-tested without Electron.
 */
export function resolveHandlerAccess(
  roles: readonly Role[] | 'public' | 'authenticated',
  session: SessionLike | null,
): { userId: number | null; role: Role | null } {
  if (roles === 'public') {
    return { userId: null, role: null }
  }
  if (!session) {
    throw new AppError('INTERNAL', 'Auth not initialised')
  }
  if (!session.user || session.locked) {
    throw new AppError('UNAUTHORIZED', 'Not authenticated')
  }
  if (roles !== 'authenticated' && !roles.includes(session.user.role)) {
    throw new AppError('FORBIDDEN', 'You do not have permission for this action')
  }
  return { userId: session.user.id, role: session.user.role }
}

/** First-run channels must not run after the business is already set up. */
export function assertSetupRequired(setupRequired: boolean): void {
  if (!setupRequired) {
    throw new AppError('CONFLICT', 'Setup has already been completed')
  }
}
