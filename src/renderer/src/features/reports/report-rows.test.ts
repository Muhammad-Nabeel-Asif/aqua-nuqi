import { describe, expect, it } from 'vitest'
import {
  ageingAsOf,
  humanHeader,
  isHiddenReportColumn,
  reportTableRows,
  visibleReportKeys,
} from './report-rows'

describe('reportTableRows', () => {
  it('uses byDay for collection (no items array)', () => {
    const rows = reportTableRows('collection', {
      byDay: [{ date: '2026-08-01', total: 40000 }],
      byMethod: [{ method: 'cash', total: 40000 }],
    })
    expect(rows).toEqual([{ date: '2026-08-01', total: 40000 }])
  })

  it('concatenates customer activity lists with a status column', () => {
    const rows = reportTableRows('customerActivity', {
      newCustomers: [{ customerId: 1, name: 'A' }],
      stopped: [{ customerId: 2, name: 'B' }],
      paused: [{ customerId: 3, name: 'C' }],
    })
    expect(rows.map((r) => r.activity)).toEqual(['New', 'Stopped', 'Paused'])
  })

  it('joins bottle-loss plant and customer rows', () => {
    const rows = reportTableRows('bottleLoss', {
      byReason: [{ reason: 'lost', quantity: 2 }],
      customerLoss: [{ kind: 'lost_bottle', quantity: 1 }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.source).toBe('Plant / van')
    expect(rows[1]?.source).toBe('With customer')
  })
})

describe('report column display', () => {
  it('hides id-like columns and humanizes headers', () => {
    expect(isHiddenReportColumn('customerId')).toBe(true)
    expect(isHiddenReportColumn('id')).toBe(true)
    expect(isHiddenReportColumn('name')).toBe(false)
    expect(humanHeader('cashVariance')).toBe('Cash difference')
    expect(humanHeader('averagePerDelivery')).toBe('Average per delivery')
    expect(visibleReportKeys([{ customerId: 1, name: 'A', revenue: 100 }])).toEqual([
      'name',
      'revenue',
    ])
  })
})

describe('ageingAsOf', () => {
  it('uses today when the selected range still ends in the future', () => {
    expect(ageingAsOf('2026-08-31', '2026-08-16')).toBe('2026-08-16')
  })

  it('uses the range end for a past month', () => {
    expect(ageingAsOf('2026-07-31', '2026-08-16')).toBe('2026-07-31')
  })
})
