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
  ListCustomersInput,
  CreateCustomerInput,
  UpdateCustomerInput,
  ChangeRateInput,
  AreaDto,
  RouteDto,
  ProductDto,
  ImportColumnKey,
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
  areas: {
    list: (input: { includeInactive?: boolean } = {}) =>
      invoke<{ items: AreaDto[] }>('areas:list', input),
    create: (input: { name: string; notes?: string | null }) =>
      invoke<{ item: AreaDto }>('areas:create', input),
    update: (input: { id: number; name?: string; notes?: string | null; isActive?: boolean }) =>
      invoke<{ item: AreaDto }>('areas:update', input),
  },
  routes: {
    list: (input: { includeInactive?: boolean; areaId?: number } = {}) =>
      invoke<{ items: RouteDto[] }>('routes:list', input),
    create: (input: {
      name: string
      areaId?: number | null
      notes?: string | null
      sortOrder?: number
    }) => invoke<{ item: RouteDto }>('routes:create', input),
    update: (input: {
      id: number
      name?: string
      areaId?: number | null
      notes?: string | null
      isActive?: boolean
      sortOrder?: number
    }) => invoke<{ item: RouteDto }>('routes:update', input),
    reorder: (orderedIds: number[]) => invoke<{ ok: true }>('routes:reorder', { orderedIds }),
  },
  products: {
    list: (input: { includeInactive?: boolean } = {}) =>
      invoke<{ items: ProductDto[] }>('products:list', input),
    create: (input: Record<string, unknown>) =>
      invoke<{ item: ProductDto }>('products:create', input),
    update: (input: Record<string, unknown> & { id: number }) =>
      invoke<{ item: ProductDto }>('products:update', input),
  },
  customers: {
    list: (input: ListCustomersInput = {}) =>
      invoke<{ items: import('@shared/contracts').CustomerListItemDto[]; total: number }>(
        'customers:list',
        input,
      ),
    get: (id: number) =>
      invoke<{
        item: import('@shared/contracts').CustomerDto
        rateHistory: import('@shared/contracts').CustomerRateDto[]
        openingsEditable: boolean
      }>('customers:get', { id }),
    nextCode: () => invoke<{ code: string }>('customers:nextCode', {}),
    create: (input: CreateCustomerInput) =>
      invoke<{ item: import('@shared/contracts').CustomerDto }>('customers:create', input),
    update: (input: UpdateCustomerInput) =>
      invoke<{ item: import('@shared/contracts').CustomerDto }>('customers:update', input),
    setStatus: (input: {
      id: number
      status: 'active' | 'paused' | 'inactive'
      reason?: string
      pausedFrom?: string | null
      pausedTo?: string | null
    }) => invoke<{ item: import('@shared/contracts').CustomerDto }>('customers:setStatus', input),
    bulkUpdate: (input: {
      ids: number[]
      areaId?: number | null
      routeId?: number | null
      status?: 'active' | 'paused' | 'inactive'
    }) => invoke<{ updated: number }>('customers:bulkUpdate', input),
    search: (query: string, limit = 10) =>
      invoke<{
        items: {
          id: number
          code: string
          name: string
          phonePrimary: string | null
          addressLine: string | null
        }[]
      }>('customers:search', { query, limit }),
    audit: (customerId: number, limit = 100) =>
      invoke<{
        items: {
          id: number
          occurredAt: string
          action: string
          summary: string
          beforeJson: string | null
          afterJson: string | null
        }[]
      }>('customers:audit', {
        customerId,
        limit,
      }),
    export: (format: 'csv' | 'xlsx' = 'csv') =>
      invoke<{ fileName: string; mimeType: string; base64: string }>('customers:export', {
        format,
      }),
    importParse: (input: { fileName: string; base64: string }) =>
      invoke<{
        headers: string[]
        suggestedMapping: Record<string, ImportColumnKey>
        previewRows: string[][]
        totalRows: number
      }>('customers:importParse', input),
    importValidate: (input: {
      fileName: string
      base64: string
      mapping: Record<string, ImportColumnKey>
      createMissingAreas: boolean
      createMissingRoutes: boolean
    }) =>
      invoke<{
        validCount: number
        errorCount: number
        errors: { row: number; field?: string; message: string }[]
        unknownAreas: string[]
        unknownRoutes: string[]
        preview: {
          row: number
          name: string
          phone: string | null
          area: string | null
          route: string | null
          rate: number | null
          openingBalance: number | null
          openingBottles: number | null
        }[]
      }>('customers:importValidate', input),
    importCommit: (input: {
      fileName: string
      base64: string
      mapping: Record<string, ImportColumnKey>
      createMissingAreas: boolean
      createMissingRoutes: boolean
    }) =>
      invoke<{ imported: number; areasCreated: number; routesCreated: number }>(
        'customers:importCommit',
        input,
      ),
    importTemplate: () =>
      invoke<{ fileName: string; mimeType: string; base64: string }>(
        'customers:importTemplate',
        {},
      ),
  },
  rates: {
    getFor: (input: { customerId: number; productId: number; onDate: string }) =>
      invoke<{ rate: number }>('rates:getFor', input),
    change: (input: ChangeRateInput) =>
      invoke<{ item: import('@shared/contracts').CustomerRateDto; warning: string | null }>(
        'rates:change',
        input,
      ),
    bulkChange: (input: {
      customerIds: number[]
      productId?: number
      rate: number
      effectiveFrom: string
      reason?: string | null
      forceClosedPeriod?: boolean
    }) =>
      invoke<{
        created: number
        items: import('@shared/contracts').CustomerRateDto[]
        warning: string | null
      }>('rates:bulkChange', input),
    previewBulk: (
      input: {
        areaId?: number
        routeId?: number
        customerType?: 'residential' | 'commercial' | 'walk_in'
        currentRate?: number
        productId?: number
      } = {},
    ) =>
      invoke<{ items: { id: number; code: string; name: string; oldRate: number | null }[] }>(
        'rates:previewBulk',
        input,
      ),
  },
  balances: {
    recalculate: (customerId?: number) =>
      invoke<{ updated: number }>('balances:recalculate', customerId ? { customerId } : {}),
  },
  ...(import.meta.env.DEV
    ? {
        dev: {
          seedDemo: () =>
            invoke<{ areas: number; routes: number; customers: number }>('dev:seedDemo', {}),
        },
      }
    : {}),
}
