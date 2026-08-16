import { describe, expect, it } from 'vitest'
import { AppError } from '@shared/errors'
import { formatAppError } from './app-error-message'

describe('formatAppError', () => {
  it('uses INTERNAL details instead of the generic IPC sentence', () => {
    const err = new AppError(
      'INTERNAL',
      'An unexpected error occurred',
      'Print template ready timeout',
    )
    expect(formatAppError(err)).toBe('Print template ready timeout')
  })

  it('keeps a specific AppError message', () => {
    expect(formatAppError(new AppError('NOT_FOUND', 'Customer not found'))).toBe(
      'Customer not found',
    )
  })

  it('turns PERIOD_LOCKED into a sentence when the message is only a code', () => {
    expect(formatAppError(new AppError('PERIOD_LOCKED', 'PERIOD_LOCKED'))).toBe(
      'This billing month is locked and cannot be changed.',
    )
    expect(
      formatAppError(new AppError('PERIOD_LOCKED', 'This billing month (2026-08) is locked.')),
    ).toBe('This billing month (2026-08) is locked.')
  })
})
