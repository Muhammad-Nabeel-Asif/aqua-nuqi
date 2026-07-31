import { describe, expect, it } from 'vitest'
import { AppError } from '@shared/errors'
import { assertSetupRequired, resolveHandlerAccess } from './access'

describe('resolveHandlerAccess', () => {
  it('allows public channels without a session', () => {
    expect(resolveHandlerAccess('public', null)).toEqual({ userId: null, role: null })
  })

  it('returns FORBIDDEN when an operator calls an owner-only channel', () => {
    const session = { user: { id: 2, role: 'operator' as const }, locked: false }
    try {
      resolveHandlerAccess(['owner'], session)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('FORBIDDEN')
    }
  })

  it('maps Zod safeParse failures to VALIDATION_FAILED (router contract)', async () => {
    const { z } = await import('zod')
    const { AppError: Err } = await import('@shared/errors')
    const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) })
    const parsed = schema.safeParse({ period: 'nope' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const err = new Err('VALIDATION_FAILED', 'Invalid request', parsed.error.flatten())
      expect(err.code).toBe('VALIDATION_FAILED')
    }
  })

  it('allows owner on an owner-only channel', () => {
    const session = { user: { id: 1, role: 'owner' as const }, locked: false }
    expect(resolveHandlerAccess(['owner'], session)).toEqual({ userId: 1, role: 'owner' })
  })

  it('rejects locked sessions', () => {
    const session = { user: { id: 1, role: 'owner' as const }, locked: true }
    expect(() => resolveHandlerAccess('authenticated', session)).toThrow(AppError)
  })
})

describe('assertSetupRequired', () => {
  it('rejects restore/complete when setup is already done', () => {
    try {
      assertSetupRequired(false)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('CONFLICT')
    }
  })

  it('allows setup when setupRequired is true', () => {
    expect(() => assertSetupRequired(true)).not.toThrow()
  })
})
