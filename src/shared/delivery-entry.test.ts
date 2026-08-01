import { describe, expect, it } from 'vitest'
import { matrixCardQtyUpsert } from './delivery-entry'

describe('matrixCardQtyUpsert', () => {
  it('clear (null or 0) forces emptiesCollected 0 so the row voids', () => {
    expect(matrixCardQtyUpsert(null)).toEqual({ quantity: 0, emptiesCollected: 0 })
    expect(matrixCardQtyUpsert(0)).toEqual({ quantity: 0, emptiesCollected: 0 })
  })

  it('positive qty omits emptiesCollected to preserve prior empties', () => {
    expect(matrixCardQtyUpsert(3)).toEqual({ quantity: 3 })
    expect(matrixCardQtyUpsert(12)).toEqual({ quantity: 12 })
    expect('emptiesCollected' in matrixCardQtyUpsert(5)).toBe(false)
  })
})
