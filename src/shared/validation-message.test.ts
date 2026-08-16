import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { zodErrorMessage } from './validation-message'

describe('zodErrorMessage', () => {
  it('names WhatsApp when the number is too short', () => {
    const schema = z.object({
      whatsappNumber: z.string().regex(/^[\d+\-\s()]{7,20}$/, 'enter a full number (7–20 digits)'),
    })
    const parsed = schema.safeParse({ whatsappNumber: '0' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(zodErrorMessage(parsed.error)).toBe('WhatsApp: enter a full number (7–20 digits)')
    }
  })
})
