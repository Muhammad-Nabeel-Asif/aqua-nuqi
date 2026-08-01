import { describe, expect, it } from 'vitest'
import { THERMAL_80MM_PAGE } from './contracts/pdf'
import { pdfPageNumbersEnabled, preferCssPageSize, toElectronPageSize } from './print-page-size'

describe('print page size helpers', () => {
  it('uses CSS page size for thermal micron specs (avoids broken MediaBox)', () => {
    expect(preferCssPageSize(THERMAL_80MM_PAGE)).toBe(true)
    expect(preferCssPageSize('A4')).toBe(false)
    expect(preferCssPageSize('A5')).toBe(false)
  })

  it('maps thermal microns to Electron { width, height }', () => {
    expect(toElectronPageSize(THERMAL_80MM_PAGE)).toEqual({
      width: 80_000,
      height: 297_000,
    })
    expect(toElectronPageSize('A4')).toBe('A4')
  })

  it('enables header/footer page numbers only for A4/Letter documents', () => {
    expect(pdfPageNumbersEnabled('A4')).toBe(true)
    expect(pdfPageNumbersEnabled('Letter')).toBe(true)
    expect(pdfPageNumbersEnabled('A5')).toBe(false)
    expect(pdfPageNumbersEnabled(THERMAL_80MM_PAGE)).toBe(false)
  })
})
