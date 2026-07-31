import { describe, expect, it } from 'vitest'
import {
  addPaisa,
  formatMoney,
  multiplyPaisa,
  parseMoneyInput,
  roundHalfUp,
  toPaisa,
  toRupees,
} from './money'

describe('money', () => {
  it('stores Rs 60.00 as 6000 paisa', () => {
    expect(toPaisa(60)).toBe(6000)
    expect(toPaisa('60.00')).toBe(6000)
  })

  it('rounds half up to nearest paisa', () => {
    expect(roundHalfUp(1.5)).toBe(2)
    expect(roundHalfUp(1.4)).toBe(1)
    expect(toPaisa(10.005)).toBe(1001)
    // Binary floats that `n * 100` mis-rounds:
    expect(toPaisa(0.005)).toBe(1)
    expect(toPaisa(1.005)).toBe(101)
    expect(toPaisa(1.015)).toBe(102)
    expect(toPaisa(-1.005)).toBe(-101)
    expect(toPaisa('1.005')).toBe(101)
  })

  it('formats with symbol and thousands separator', () => {
    expect(formatMoney(toPaisa(1250))).toBe('Rs 1,250')
  })

  it('parses typed money input', () => {
    expect(parseMoneyInput('1,250.50')).toBe(125050)
  })

  it('multiplies unit price by quantity with final rounding only', () => {
    const unit = toPaisa(60)
    expect(multiplyPaisa(unit, 3)).toBe(18000)
    expect(toRupees(addPaisa(unit, toPaisa(40)))).toBe(100)
  })
})
