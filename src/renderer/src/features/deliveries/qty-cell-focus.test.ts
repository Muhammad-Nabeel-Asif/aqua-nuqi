import { describe, expect, it } from 'vitest'
import { qtyCellMayTakeFocus } from './qty-cell-focus'

describe('qtyCellMayTakeFocus', () => {
  it('does not steal focus from another input (search bar)', () => {
    expect(qtyCellMayTakeFocus({ tagName: 'INPUT' }, { tagName: 'INPUT' })).toBe(false)
  })

  it('allows focus when nothing else is editing', () => {
    const cell = { tagName: 'INPUT' }
    expect(qtyCellMayTakeFocus(null, cell)).toBe(true)
    expect(qtyCellMayTakeFocus({ tagName: 'DIV' }, cell)).toBe(true)
    expect(qtyCellMayTakeFocus(cell, cell)).toBe(true)
  })
})
