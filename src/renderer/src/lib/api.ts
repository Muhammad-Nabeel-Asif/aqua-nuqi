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
  deliveries: {
    upsert: (input: import('@shared/contracts').UpsertDeliveryInput) =>
      invoke<{ item: import('@shared/contracts').DeliveryDto }>('deliveries:upsert', input),
    void: (id: number, reason: string) =>
      invoke<{ item: import('@shared/contracts').DeliveryDto }>('deliveries:void', {
        id,
        reason,
      }),
    get: (id: number) =>
      invoke<{ item: import('@shared/contracts').DeliveryDto }>('deliveries:get', { id }),
    getDayList: (input: import('@shared/contracts').DayListFilters) =>
      invoke<import('@shared/contracts').GetDayListOutput>('deliveries:getDayList', input),
    getMonthGrid: (input: import('@shared/contracts').GetMonthGridInput) =>
      invoke<import('@shared/contracts').GetMonthGridOutput>('deliveries:getMonthGrid', input),
    getCustomerCard: (input: import('@shared/contracts').GetCustomerCardInput) =>
      invoke<import('@shared/contracts').GetCustomerCardOutput>(
        'deliveries:getCustomerCard',
        input,
      ),
    summary: (input: import('@shared/contracts').DeliverySummaryInput) =>
      invoke<import('@shared/contracts').DeliverySummaryOutput>('deliveries:summary', input),
    copyPreviousDay: (input: { date: string; routeId?: number; productId?: number }) =>
      invoke<import('@shared/contracts').CopyPreviousDayOutput>(
        'deliveries:copyPreviousDay',
        input,
      ),
    walkIn: (input: import('@shared/contracts').WalkInSaleInput) =>
      invoke<{ item: import('@shared/contracts').DeliveryDto }>('deliveries:walkIn', input),
    bottlesOut: (
      input: {
        search?: string
        routeId?: number
        areaId?: number
        minBottles?: number
      } = {},
    ) => invoke<import('@shared/contracts').BottlesOutOutput>('deliveries:bottlesOut', input),
    missed: (input: { asOf?: string; thresholdDays?: number; routeId?: number } = {}) =>
      invoke<import('@shared/contracts').MissedDeliveriesOutput>('deliveries:missed', input),
    recordLoss: (input: {
      customerId: number
      date: string
      kind: 'damaged_bottle' | 'lost_bottle'
      quantity: number
      amount?: number
      description?: string
    }) => invoke<{ id: number; bottlesWithCustomer: number }>('deliveries:recordLoss', input),
    exportMonthGrid: (
      input: import('@shared/contracts').GetMonthGridInput & { format: 'csv' | 'xlsx' },
    ) =>
      invoke<{ fileName: string; mimeType: string; base64: string }>(
        'deliveries:exportMonthGrid',
        input,
      ),
    todaySummary: (date?: string) =>
      invoke<{ customersServed: number; totalBottles: number; totalAmount: number }>(
        'deliveries:todaySummary',
        date ? { date } : {},
      ),
  },
  invoices: {
    preview: (customerId: number, period: string) =>
      invoke<{ preview: import('@shared/contracts').InvoicePreviewDto }>('invoices:preview', {
        customerId,
        period,
      }),
    previewBatch: (input: {
      period: string
      filter: {
        mode: 'all' | 'area' | 'route' | 'selected'
        areaId?: number
        routeId?: number
        customerIds?: number[]
      }
      includeZeroActivity?: boolean
    }) =>
      invoke<{ items: import('@shared/contracts').InvoicePreviewDto[] }>(
        'invoices:previewBatch',
        input,
      ),
    generate: (input: {
      customerId: number
      period: string
      issueDate?: string
      notes?: string
      forceClosedPeriod?: boolean
    }) => invoke<{ item: import('@shared/contracts').InvoiceDto }>('invoices:generate', input),
    generateBatch: (input: {
      period: string
      filter: {
        mode: 'all' | 'area' | 'route' | 'selected'
        areaId?: number
        routeId?: number
        customerIds?: number[]
      }
      issueDate?: string
      includeZeroActivity?: boolean
      forceClosedPeriod?: boolean
    }) =>
      invoke<{
        generated: number
        skipped: Array<{ customerId: number; code: string; name: string; reason: string }>
        invoiceIds: number[]
        elapsedMs: number
      }>('invoices:generateBatch', input),
    issue: (id: number, forceClosedPeriod?: boolean) =>
      invoke<{ item: import('@shared/contracts').InvoiceDto }>('invoices:issue', {
        id,
        forceClosedPeriod,
      }),
    issueAll: (invoiceIds: number[], forceClosedPeriod?: boolean) =>
      invoke<{ issued: number; errors: string[] }>('invoices:issueAll', {
        invoiceIds,
        forceClosedPeriod,
      }),
    void: (id: number, reason: string, forceClosedPeriod?: boolean) =>
      invoke<{ item: import('@shared/contracts').InvoiceDto }>('invoices:void', {
        id,
        reason,
        forceClosedPeriod,
      }),
    list: (
      input: {
        period?: string
        status?: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
        customerId?: number
        areaId?: number
        routeId?: number
        overdueOnly?: boolean
        search?: string
        limit?: number
        offset?: number
      } = {},
    ) =>
      invoke<{ items: import('@shared/contracts').InvoiceDto[]; total: number }>(
        'invoices:list',
        input,
      ),
    get: (id: number) =>
      invoke<{ item: import('@shared/contracts').InvoiceDto }>('invoices:get', { id }),
    markShared: (invoiceIds: number[]) =>
      invoke<{ count: number }>('invoices:markShared', { invoiceIds }),
  },
  billing: {
    periodsOverview: () =>
      invoke<{
        items: Array<{
          period: string
          closed: boolean
          deliveryCount: number
          invoiceCount: number
          revenue: number
        }>
      }>('billing:periodsOverview', {}),
  },
  adjustments: {
    create: (input: {
      customerId: number
      adjustmentDate: string
      kind:
        | 'damaged_bottle'
        | 'lost_bottle'
        | 'dispenser_rent'
        | 'delivery_charge'
        | 'other_charge'
        | 'discount'
        | 'write_off'
        | 'deposit_received'
        | 'deposit_refunded'
      amount: number
      quantity?: number | null
      description?: string | null
    }) => invoke<{ item: unknown }>('adjustments:create', input),
    void: (id: number, reason: string) =>
      invoke<{ item: unknown }>('adjustments:void', { id, reason }),
    list: (customerId: number, unbilledOnly?: boolean) =>
      invoke<{ items: unknown[] }>('adjustments:list', { customerId, unbilledOnly }),
  },
  ledger: {
    get: (customerId: number, from?: string, to?: string) =>
      invoke<{
        items: Array<{
          id: number
          entryDate: string
          entryType: string
          debit: number
          credit: number
          balanceAfter: number
          description: string
          refTable: string | null
          refId: number | null
          isNonRevenue: boolean
        }>
      }>('ledger:get', { customerId, from, to }),
  },
  payments: {
    record: (input: import('@shared/contracts').RecordPaymentInput) =>
      invoke<{ item: import('@shared/contracts').PaymentDto }>('payments:record', input),
    void: (id: number, reason: string) =>
      invoke<{ item: import('@shared/contracts').PaymentDto }>('payments:void', { id, reason }),
    reallocate: (id: number, allocations: Array<{ invoiceId: number; amount: number }>) =>
      invoke<{ item: import('@shared/contracts').PaymentDto }>('payments:reallocate', {
        id,
        allocations,
      }),
    list: (
      input: {
        from?: string
        to?: string
        method?: import('@shared/contracts').PaymentDto['method']
        customerId?: number
        status?: 'active' | 'void'
        limit?: number
        offset?: number
      } = {},
    ) =>
      invoke<{
        items: import('@shared/contracts').PaymentDto[]
        total: number
        totalAmount: number
      }>('payments:list', input),
    get: (id: number) =>
      invoke<{ item: import('@shared/contracts').PaymentDto }>('payments:get', { id }),
    postCollectedCash: (date: string) =>
      invoke<{
        created: number
        skipped: number
        paymentIds: number[]
        totalAmount: number
      }>('payments:postCollectedCash', { date }),
    collectedCashPreview: (date: string) =>
      invoke<{
        date: string
        rows: Array<{
          customerId: number
          code: string
          name: string
          cashCollected: number
          alreadyPosted: boolean
        }>
        total: number
      }>('payments:collectedCashPreview', { date }),
  },
  receivables: {
    report: (asOf?: string) =>
      invoke<{
        asOf: string
        outstanding: Array<{
          customerId: number
          code: string
          name: string
          phone: string | null
          areaName: string | null
          routeName: string | null
          balance: number
          oldestUnpaidInvoiceDate: string | null
          daysOverdue: number
          ageingBucket: 'current' | '1-30' | '31-60' | '60+'
          lastPaymentDate: string | null
        }>
        inCredit: Array<{
          customerId: number
          code: string
          name: string
          phone: string | null
          balance: number
          ageingBucket: string
          lastPaymentDate: string | null
        }>
        bucketTotals: Record<'current' | '1-30' | '31-60' | '60+', number>
        totalOutstanding: number
        totalCredit: number
      }>('receivables:report', asOf ? { asOf } : {}),
  },
  print: {
    getJob: (jobId: string) =>
      invoke<{
        jobId: string
        template: import('@shared/contracts').PrintTemplateId
        payload: unknown
        pageSize: import('@shared/contracts').PageSizeSpec
        accentColour: string
      }>('print:getJob', { jobId }),
    documentReady: (jobId: string) => invoke<{ ok: true }>('print:documentReady', { jobId }),
  },
  pdf: {
    generateInvoice: (invoiceId: number, openAfter?: boolean) =>
      invoke<{ path: string; invoiceId: number }>('pdf:generateInvoice', {
        invoiceId,
        openAfter,
      }),
    batchGenerate: (input: {
      period?: string
      invoiceIds?: number[]
      filter?: {
        mode: 'all' | 'area' | 'route' | 'selected'
        areaId?: number
        routeId?: number
        customerIds?: number[]
      }
      jobId?: string
    }) =>
      invoke<{
        generated: number
        cancelled: boolean
        folder: string
        files: string[]
        errors: Array<{ invoiceId: number; message: string }>
        elapsedMs: number
      }>('pdf:batchGenerate', input),
    cancelBatch: (jobId: string) => invoke<{ ok: true }>('pdf:cancelBatch', { jobId }),
    businessHeader: () =>
      invoke<{
        name: string
        address: string
        phone: string
        phone2: string
        email: string
        bankDetails: string
        taxNumber: string
        logoDataUrl: string | null
        accentColour: string
        footerNote: string
        termsText: string
        showBottleBalance: boolean
        showRateColumn: boolean
        currencySymbol: string
        decimalPlaces: number
        numberingSystem: string
      }>('pdf:businessHeader', {}),
    getInvoicePrintPayload: (invoiceId: number) =>
      invoke<import('@renderer/print/templates/InvoiceTemplate').InvoiceTemplateProps>(
        'pdf:getInvoicePrintPayload',
        { invoiceId },
      ),
    printInvoice: (invoiceId: number, deviceName?: string) =>
      invoke<{ ok: true }>('pdf:printInvoice', { invoiceId, deviceName }),
    generateReceipt: (paymentId: number, variant?: 'a5' | 'thermal', openAfter?: boolean) =>
      invoke<{ path: string }>('pdf:generateReceipt', { paymentId, variant, openAfter }),
    generateDeliverySlip: (deliveryId: number, openAfter?: boolean) =>
      invoke<{ path: string }>('pdf:generateDeliverySlip', { deliveryId, openAfter }),
    generateStatement: (
      customerId: number,
      opts: { from?: string; to?: string; openAfter?: boolean } = {},
    ) => invoke<{ path: string }>('pdf:generateStatement', { customerId, ...opts }),
    generateDeliveryCard: (customerId: number, period: string, openAfter?: boolean) =>
      invoke<{ path: string }>('pdf:generateDeliveryCard', {
        customerId,
        period,
        openAfter,
      }),
    generateBottlesOut: (
      input: {
        search?: string
        routeId?: number
        areaId?: number
        minBottles?: number
        openAfter?: boolean
      } = {},
    ) => invoke<{ path: string }>('pdf:generateBottlesOut', input),
    generateReceivables: (asOf?: string, openAfter?: boolean) =>
      invoke<{ path: string }>('pdf:generateReceivables', { asOf, openAfter }),
    exportTable: (input: import('@shared/contracts').ExportTableInput) =>
      invoke<{ path: string }>('pdf:exportTable', input),
    exportExcel: (input: import('@shared/contracts').ExportExcelInput) =>
      invoke<{ path: string }>('pdf:exportExcel', input),
    shareWhatsApp: (invoiceId: number, phoneOverride?: string) =>
      invoke<{
        ok: true
        waUrl: string
        pdfPath: string | null
        phoneWarning: string | null
        e164: string | null
      }>('pdf:shareWhatsApp', { invoiceId, phoneOverride }),
    shareEmail: (invoiceId: number) =>
      invoke<{ ok: true; mailtoUrl: string; pdfPath: string | null }>('pdf:shareEmail', {
        invoiceId,
      }),
    saveAs: (sourcePath: string, defaultName?: string) =>
      invoke<{ path: string | null }>('pdf:saveAs', { sourcePath, defaultName }),
    open: (path: string) => invoke<{ ok: true }>('pdf:open', { path }),
    showInFolder: (path: string) => invoke<{ ok: true }>('pdf:showInFolder', { path }),
    uploadLogo: (sourcePath: string) =>
      invoke<{ logoPath: string }>('pdf:uploadLogo', { sourcePath }),
    generateSalarySlip: (itemId: number, openAfter?: boolean) =>
      invoke<{ path: string }>('pdf:generateSalarySlip', { itemId, openAfter }),
    batchGenerateSalarySlips: (runId: number, openFolder?: boolean) =>
      invoke<{ folder: string; files: string[]; generated: number }>(
        'pdf:batchGenerateSalarySlips',
        { runId, openFolder },
      ),
  },
  employees: {
    list: (input: import('@shared/contracts').ListEmployeesInput = {}) =>
      invoke<{ items: import('@shared/contracts').EmployeeDto[]; total: number }>(
        'employees:list',
        input,
      ),
    listActive: () =>
      invoke<{
        items: Array<{ id: number; code: string; name: string; role: string }>
      }>('employees:listActive', {}),
    get: (id: number) =>
      invoke<{
        item: import('@shared/contracts').EmployeeDto
        salaryHistory: import('@shared/contracts').EmployeeSalaryDto[]
      }>('employees:get', { id }),
    nextCode: () => invoke<{ code: string }>('employees:nextCode', {}),
    create: (input: import('@shared/contracts').CreateEmployeeInput) =>
      invoke<{ item: import('@shared/contracts').EmployeeDto }>('employees:create', input),
    update: (input: import('@shared/contracts').UpdateEmployeeInput) =>
      invoke<{ item: import('@shared/contracts').EmployeeDto }>('employees:update', input),
    setStatus: (input: import('@shared/contracts').SetEmployeeStatusInput) =>
      invoke<{
        item: import('@shared/contracts').EmployeeDto
        outstandingAdvances: number
        warning: string | null
      }>('employees:setStatus', input),
    changeSalary: (input: import('@shared/contracts').ChangeSalaryInput) =>
      invoke<{
        item: import('@shared/contracts').EmployeeSalaryDto
        warning: string | null
      }>('employees:changeSalary', input),
    uploadPhoto: (sourcePath: string, employeeId?: number) =>
      invoke<{ photoPath: string }>('employees:uploadPhoto', { sourcePath, employeeId }),
    payrollHistory: (employeeId: number) =>
      invoke<{
        items: Array<{
          period: string
          status: string
          netPayable: number
          paidAmount: number
        }>
      }>('employees:payrollHistory', { employeeId }),
    performance: (employeeId: number, period?: string) =>
      invoke<import('@shared/contracts').EmployeePerformanceOutput>('employees:performance', {
        employeeId,
        period,
      }),
    comparePerformance: (period: string) =>
      invoke<import('@shared/contracts').ComparePerformanceOutput>('employees:comparePerformance', {
        period,
      }),
  },
  attendance: {
    getMonth: (period: string) =>
      invoke<import('@shared/contracts').GetAttendanceMonthOutput>('attendance:getMonth', {
        period,
      }),
    set: (input: import('@shared/contracts').SetAttendanceInput) =>
      invoke<{ cell: import('@shared/contracts').AttendanceCellDto }>('attendance:set', input),
    setRange: (input: import('@shared/contracts').SetAttendanceRangeInput) =>
      invoke<{ updated: number }>('attendance:setRange', input),
    markAllPresent: (input: import('@shared/contracts').MarkAllPresentInput) =>
      invoke<{ updated: number }>('attendance:markAllPresent', input),
    markHoliday: (input: import('@shared/contracts').MarkHolidayInput) =>
      invoke<{ updated: number }>('attendance:markHoliday', input),
    today: (date?: string) =>
      invoke<import('@shared/contracts').TodayAttendanceOutput>('attendance:today', { date }),
  },
  advances: {
    list: (input: import('@shared/contracts').ListAdvancesInput = {}) =>
      invoke<{
        items: import('@shared/contracts').SalaryAdvanceDto[]
        outstandingTotal: number
      }>('advances:list', input),
    create: (input: import('@shared/contracts').CreateAdvanceInput) =>
      invoke<{ item: import('@shared/contracts').SalaryAdvanceDto }>('advances:create', input),
    void: (id: number, reason: string, forceClosedPeriod?: boolean) =>
      invoke<{ item: import('@shared/contracts').SalaryAdvanceDto }>('advances:void', {
        id,
        reason,
        forceClosedPeriod,
      }),
    waive: (id: number, reason: string, forceClosedPeriod?: boolean) =>
      invoke<{ item: import('@shared/contracts').SalaryAdvanceDto }>('advances:waive', {
        id,
        reason,
        forceClosedPeriod,
      }),
  },
  payroll: {
    list: () => invoke<{ items: import('@shared/contracts').PayrollRunDto[] }>('payroll:list', {}),
    get: (id: number) =>
      invoke<{
        run: import('@shared/contracts').PayrollRunDto
        items: import('@shared/contracts').PayrollItemDto[]
      }>('payroll:get', { id }),
    generate: (period: string, forceClosedPeriod?: boolean) =>
      invoke<{
        run: import('@shared/contracts').PayrollRunDto
        items: import('@shared/contracts').PayrollItemDto[]
      }>('payroll:generate', { period, forceClosedPeriod }),
    updateItem: (input: import('@shared/contracts').UpdatePayrollItemInput) =>
      invoke<{ item: import('@shared/contracts').PayrollItemDto }>('payroll:updateItem', input),
    finalize: (input: import('@shared/contracts').FinalizePayrollInput) =>
      invoke<{
        run: import('@shared/contracts').PayrollRunDto
        items: import('@shared/contracts').PayrollItemDto[]
        salariesExpenseTotal: number
      }>('payroll:finalize', input),
    void: (id: number, reason: string, forceClosedPeriod?: boolean) =>
      invoke<{ run: import('@shared/contracts').PayrollRunDto }>('payroll:void', {
        id,
        reason,
        forceClosedPeriod,
      }),
    recordPayment: (input: import('@shared/contracts').RecordPayrollPaymentInput) =>
      invoke<{ item: import('@shared/contracts').PayrollItemDto }>('payroll:recordPayment', input),
    payAll: (input: import('@shared/contracts').PayAllPayrollInput) =>
      invoke<{ items: import('@shared/contracts').PayrollItemDto[] }>('payroll:payAll', input),
  },
  expenses: {
    create: (input: import('@shared/contracts').CreateExpenseInput) =>
      invoke<{ item: import('@shared/contracts').ExpenseDto }>('expenses:create', input),
    update: (input: import('@shared/contracts').UpdateExpenseInput) =>
      invoke<{ item: import('@shared/contracts').ExpenseDto }>('expenses:update', input),
    void: (id: number, reason: string, forceClosedPeriod?: boolean) =>
      invoke<{ item: import('@shared/contracts').ExpenseDto }>('expenses:void', {
        id,
        reason,
        forceClosedPeriod,
      }),
    list: (input: import('@shared/contracts').ListExpensesInput = {}) =>
      invoke<{
        items: import('@shared/contracts').ExpenseDto[]
        total: number
        totalAmount: number
        previousTotalAmount: number
      }>('expenses:list', input),
    get: (id: number) =>
      invoke<{ item: import('@shared/contracts').ExpenseDto }>('expenses:get', { id }),
    summaryByCategory: (from: string, to: string) =>
      invoke<{
        items: import('@shared/contracts').CategoryTotalDto[]
        total: number
      }>('expenses:summaryByCategory', { from, to }),
    summaryByMonth: (from: string, to: string) =>
      invoke<{ items: import('@shared/contracts').MonthTotalDto[] }>('expenses:summaryByMonth', {
        from,
        to,
      }),
    insights: (from: string, to: string) =>
      invoke<{
        byCategory: import('@shared/contracts').CategoryTotalDto[]
        byMonth: import('@shared/contracts').MonthTotalDto[]
        topVendors: import('@shared/contracts').VendorTotalDto[]
        total: number
      }>('expenses:insights', { from, to }),
    attributionOptions: () =>
      invoke<{
        employees: Array<{ id: number; name: string; code: string }>
        vehicles: Array<{ id: number; name: string }>
      }>('expenses:attributionOptions', {}),
    cashBook: (input: { date: string; openingCash?: number; countedCash?: number | null }) =>
      invoke<{
        date: string
        openingCash: number
        cashIn: number
        cashOut: number
        closingCash: number
        countedCash: number | null
        variance: number | null
        cashInCount: number
        cashOutCount: number
      }>('expenses:cashBook', input),
    attachReceipt: (sourcePath: string, expenseDate?: string) =>
      invoke<{
        relativePath: string
        absolutePath: string
        warnedLarge: boolean
        downscaled: boolean
      }>('expenses:attachReceipt', { sourcePath, expenseDate }),
    resolveAttachment: (relativePath: string) =>
      invoke<{ absolutePath: string | null; exists: boolean }>('expenses:resolveAttachment', {
        relativePath,
      }),
    openAttachment: (relativePath: string) =>
      invoke<{ ok: true }>('expenses:openAttachment', { relativePath }),
    attachmentPreview: (relativePath: string) =>
      invoke<{ dataUrl: string | null }>('expenses:attachmentPreview', { relativePath }),
  },
  expenseCategories: {
    list: (includeInactive?: boolean) =>
      invoke<{ items: import('@shared/contracts').ExpenseCategoryDto[] }>(
        'expenseCategories:list',
        { includeInactive },
      ),
    create: (input: { name: string; parentId?: number | null }) =>
      invoke<{ item: import('@shared/contracts').ExpenseCategoryDto }>(
        'expenseCategories:create',
        input,
      ),
    update: (input: { id: number; name?: string; parentId?: number | null; isActive?: boolean }) =>
      invoke<{ item: import('@shared/contracts').ExpenseCategoryDto }>(
        'expenseCategories:update',
        input,
      ),
    reorder: (orderedIds: number[]) =>
      invoke<{ ok: true }>('expenseCategories:reorder', { orderedIds }),
    merge: (fromId: number, intoId: number) =>
      invoke<{ moved: number; item: import('@shared/contracts').ExpenseCategoryDto }>(
        'expenseCategories:merge',
        { fromId, intoId },
      ),
  },
  recurringExpenses: {
    list: (includeInactive?: boolean) =>
      invoke<{ items: import('@shared/contracts').RecurringExpenseDto[] }>(
        'recurringExpenses:list',
        { includeInactive },
      ),
    create: (input: {
      name: string
      categoryId: number
      amount: number
      frequency: 'monthly' | 'quarterly' | 'yearly'
      dayOfMonth?: number | null
      vendorName?: string | null
      nextDueDate: string
    }) =>
      invoke<{ item: import('@shared/contracts').RecurringExpenseDto }>(
        'recurringExpenses:create',
        input,
      ),
    update: (input: {
      id: number
      name?: string
      categoryId?: number
      amount?: number
      frequency?: 'monthly' | 'quarterly' | 'yearly'
      dayOfMonth?: number | null
      vendorName?: string | null
      nextDueDate?: string
      isActive?: boolean
    }) =>
      invoke<{ item: import('@shared/contracts').RecurringExpenseDto }>(
        'recurringExpenses:update',
        input,
      ),
    due: (asOf?: string) =>
      invoke<{ items: import('@shared/contracts').RecurringExpenseDto[] }>(
        'recurringExpenses:due',
        { asOf },
      ),
  },
  ...(import.meta.env.DEV
    ? {
        dev: {
          seedDemo: () =>
            invoke<{
              areas: number
              routes: number
              customers: number
              deliveries: number
            }>('dev:seedDemo', {}),
        },
      }
    : {}),
}
