import { describe, expect, it } from 'vitest'
import { zodErrorMessage } from '../validation-message'
import { customerWriteFields } from './customers'

describe('customerWriteFields phone', () => {
  it('rejects a one-digit WhatsApp number with a clear field message', () => {
    const parsed = customerWriteFields.safeParse({
      name: 'Ali House',
      whatsappNumber: '0',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(zodErrorMessage(parsed.error)).toMatch(/WhatsApp/i)
      expect(zodErrorMessage(parsed.error)).toMatch(/full number/i)
    }
  })

  it('accepts a full Pakistani mobile on WhatsApp', () => {
    const parsed = customerWriteFields.safeParse({
      name: 'Ali House',
      phonePrimary: '03421370753',
      whatsappNumber: '03421370753',
    })
    expect(parsed.success).toBe(true)
  })
})
