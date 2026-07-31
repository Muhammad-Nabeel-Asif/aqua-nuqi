import { describe, expect, it } from 'vitest'
import {
  formatDisplayDate,
  isBusinessDate,
  isPeriod,
  periodEnd,
  periodFromDate,
  periodStart,
  previousPeriod,
} from './date'

describe('date', () => {
  it('validates business dates and periods', () => {
    expect(isBusinessDate('2026-07-31')).toBe(true)
    expect(isBusinessDate('2026-13-01')).toBe(false)
    expect(isPeriod('2026-07')).toBe(true)
    expect(isPeriod('2026-13')).toBe(false)
  })

  it('derives period boundaries', () => {
    expect(periodFromDate('2026-07-15')).toBe('2026-07')
    expect(periodStart('2026-07')).toBe('2026-07-01')
    expect(periodEnd('2026-02')).toBe('2026-02-28')
    expect(periodEnd('2024-02')).toBe('2024-02-29')
    expect(previousPeriod('2026-01')).toBe('2025-12')
  })

  it('formats for display as DD-MM-YYYY', () => {
    expect(formatDisplayDate('2026-07-31')).toBe('31-07-2026')
  })
})
