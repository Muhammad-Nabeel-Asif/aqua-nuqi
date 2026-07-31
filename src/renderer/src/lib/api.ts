import type {
  AboutGetOutput,
  CreateUserInput,
  LoginInput,
  SettingsGetInput,
  SettingsSetManyInput,
  SetupCompleteInput,
  SetupRestoreInput,
  SetupStatusOutput,
  UnlockInput,
  UserDto,
} from '@shared/contracts'
import { AppError, type AppErrorCode } from '@shared/errors'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await window.api.invoke<T>(channel, payload)
  if (!result.ok) {
    throw new AppError(
      result.error.code as AppErrorCode,
      result.error.message,
      result.error.details,
    )
  }
  return result.data
}

export const api = {
  auth: {
    login: (input: LoginInput) => invoke<{ user: UserDto }>('auth:login', input),
    logout: () => invoke<{ ok: true }>('auth:logout', {}),
    session: () =>
      invoke<{ user: UserDto | null; locked: boolean; setupRequired: boolean }>('auth:session', {}),
    lock: () => invoke<{ ok: true }>('auth:lock', {}),
    unlock: (input: UnlockInput) => invoke<{ ok: true }>('auth:unlock', input),
    createUser: (input: CreateUserInput) => invoke<{ user: UserDto }>('auth:createUser', input),
    listUsers: () => invoke<{ items: UserDto[] }>('auth:listUsers', {}),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      invoke<{ ok: true }>('auth:changePassword', input),
    setPin: (input: { pin: string; password: string }) =>
      invoke<{ ok: true }>('auth:setPin', input),
  },
  settings: {
    get: (input?: SettingsGetInput) =>
      invoke<{ values: Record<string, unknown> }>('settings:get', input ?? {}),
    setMany: (input: SettingsSetManyInput) =>
      invoke<{ values: Record<string, unknown> }>('settings:setMany', input),
  },
  setup: {
    status: () => invoke<SetupStatusOutput>('setup:status', {}),
    complete: (input: SetupCompleteInput) => invoke<{ user: UserDto }>('setup:complete', input),
    restore: (input: SetupRestoreInput) => invoke<{ ok: true }>('setup:restore', input),
  },
  dialog: {
    pickFolder: (input?: { title?: string; defaultPath?: string }) =>
      invoke<{ path: string | null }>('dialog:pickFolder', input ?? {}),
    pickFile: (input?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
      invoke<{ path: string | null }>('dialog:pickFile', input ?? {}),
  },
  period: {
    isClosed: (period: string) => invoke<{ closed: boolean }>('period:isClosed', { period }),
    close: (period: string, notes?: string) =>
      invoke<{ ok: true }>('period:close', { period, notes }),
    reopen: (period: string, reason: string) =>
      invoke<{ ok: true }>('period:reopen', { period, reason }),
    list: () =>
      invoke<{
        items: {
          period: string
          closedAt: string
          reopenedAt: string | null
          notes: string | null
        }[]
      }>('period:list', {}),
  },
  backup: {
    create: (kind: 'manual' | 'on_exit' | 'daily' | 'weekly' = 'manual') =>
      invoke<{ filePath: string; sizeBytes: number; checksum: string }>('backup:create', {
        kind,
      }),
    list: () =>
      invoke<{
        items: {
          id: number
          createdAt: string
          kind: string
          filePath: string
          sizeBytes: number | null
          checksum: string | null
          status: string
          message: string | null
        }[]
        lastSuccessAt: string | null
      }>('backup:list', {}),
  },
  about: {
    get: () => invoke<AboutGetOutput>('about:get', {}),
  },
  diagnostics: {
    export: (destinationFolder: string) =>
      invoke<{ zipPath: string }>('diagnostics:export', { destinationFolder }),
  },
  shell: {
    openPath: (path: string) => invoke<{ ok: true }>('shell:openPath', { path }),
  },
}
