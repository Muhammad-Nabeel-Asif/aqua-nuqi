import { describe, expect, it } from 'vitest'
import { isMoneyColumn } from './money-columns'

describe('isMoneyColumn', () => {
  it('formats customer-wise and area/route averages as money (not raw paisa)', () => {
    expect(isMoneyColumn('averagePerDelivery')).toBe(true)
    expect(isMoneyColumn('averageRevenuePerCustomer')).toBe(true)
    expect(isMoneyColumn('revenue')).toBe(true)
  })

  it('does not treat bottle/unit counts as money', () => {
    expect(isMoneyColumn('units')).toBe(false)
    expect(isMoneyColumn('deliveryDays')).toBe(false)
    expect(isMoneyColumn('activeCustomers')).toBe(false)
    expect(isMoneyColumn('bottleVariance')).toBe(false)
  })
})
