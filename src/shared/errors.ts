export const APP_ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'PERIOD_LOCKED',
  'DELIVERY_INVOICED',
  'INVOICE_EXISTS',
  'INVOICE_ALREADY_ISSUED',
  'INVOICE_NOT_EDITABLE',
  'INTERNAL',
  'APP_OLDER_THAN_DATA',
  'FATAL_PATH',
  'MIGRATION_FAILED',
  'SETUP_REQUIRED',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export type AppErrorPayload = {
  code: AppErrorCode
  message: string
  details?: unknown
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
