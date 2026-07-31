import { describe, expect, it } from 'vitest'
import { toWhatsAppE164 } from './phone'

describe('toWhatsAppE164', () => {
  it('converts PK mobiles starting with 0', () => {
    expect(toWhatsAppE164('03001234567')).toBe('923001234567')
    expect(toWhatsAppE164('0300-123-4567')).toBe('923001234567')
  })

  it('leaves already-prefixed numbers alone', () => {
    expect(toWhatsAppE164('923001234567')).toBe('923001234567')
    expect(toWhatsAppE164('+92 300 1234567')).toBe('923001234567')
  })
})
