import { describe, expect, it } from 'vitest'
import { isPakistanHoliday } from './holidays'

describe('isPakistanHoliday', () => {
  it('tints Independence Day and weekends are separate concerns', () => {
    expect(isPakistanHoliday('2026-08-14')).toBe(true)
    expect(isPakistanHoliday('2026-03-23')).toBe(true)
    expect(isPakistanHoliday('2026-07-15')).toBe(false)
  })
})
