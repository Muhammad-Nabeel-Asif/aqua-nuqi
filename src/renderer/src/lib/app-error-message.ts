import { AppError } from '@shared/errors'

/** User-facing sentence from an IPC / AppError, including Zod field details. */
export function formatAppError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AppError) {
    if (err.code === 'PERIOD_LOCKED') {
      const generic =
        !err.message.trim() ||
        err.message === 'PERIOD_LOCKED' ||
        err.message === 'An unexpected error occurred' ||
        err.message === 'Invalid request'
      if (!generic) return err.message
      return 'This billing month is locked and cannot be changed.'
    }
    const generic =
      err.message === 'An unexpected error occurred' || err.message === 'Invalid request'
    if (!generic && err.message.trim()) return err.message
    if (typeof err.details === 'string' && err.details.trim()) return err.details
    if (err.details && typeof err.details === 'object') {
      const flat = err.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
      const fieldMsgs = Object.entries(flat.fieldErrors ?? {}).flatMap(([key, msgs]) =>
        (msgs ?? []).map((msg) => `${key}: ${msg}`),
      )
      const msgs = [...(flat.formErrors ?? []), ...fieldMsgs].filter(Boolean)
      if (msgs.length) return msgs.join('; ')
    }
    if (err.message.trim()) return err.message
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return fallback
}
