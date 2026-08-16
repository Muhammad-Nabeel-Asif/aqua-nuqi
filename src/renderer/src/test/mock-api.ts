import { vi } from 'vitest'
import type { UserDto } from '@shared/contracts'

export const ownerUser: UserDto = {
  id: 1,
  uuid: 'owner-uuid',
  username: 'owner',
  displayName: 'Owner',
  role: 'owner',
  isActive: true,
  hasPin: false,
  lastLoginAt: null,
}

export const operatorUser: UserDto = {
  ...ownerUser,
  id: 2,
  uuid: 'op-uuid',
  username: 'clerk',
  displayName: 'Clerk',
  role: 'operator',
}

export function mockInvoke() {
  return vi.mocked(window.api.invoke)
}

export function ipcOk<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

export function ipcErr(code: string, message: string) {
  return Promise.resolve({ ok: false as const, error: { code, message } })
}
