import { describe, expect, it } from 'vitest'
import {
  formatDisplayDate,
  formatDisplayDateTime,
  isBusinessDate,
  isPeriod,
  periodEnd,
  periodFromDate,
  periodStart,
  previousPeriod,
  resolveDisplayDateKind,
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

  it('formats ISO timestamps as datetime; business dates stay as date', () => {
    const iso = '2026-08-02T10:15:30.000Z'
    expect(resolveDisplayDateKind(iso)).toBe('datetime')
    expect(resolveDisplayDateKind(iso, 'date')).toBe('datetime')
    expect(resolveDisplayDateKind('2026-08-02')).toBe('date')
    expect(resolveDisplayDateKind(iso, 'datetime')).toBe('datetime')
    expect(() => formatDisplayDate(iso)).toThrow(/Invalid business date/)
    expect(formatDisplayDateTime(iso)).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/)
  })
})
