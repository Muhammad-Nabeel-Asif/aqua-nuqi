import { describe, expect, it } from 'vitest'
import { THERMAL_80MM_PAGE } from './contracts/pdf'
import {
  buildPdfPageFooterTemplate,
  pdfPageNumbersEnabled,
  preferCssPageSize,
  toElectronPageSize,
} from './print-page-size'

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

  describe('buildPdfPageFooterTemplate', () => {
    it('keeps the Chromium page-number spans, which body CSS cannot replace', () => {
      const html = buildPdfPageFooterTemplate('Aqua Nuqi')
      expect(html).toContain('class="pageNumber"')
      expect(html).toContain('class="totalPages"')
    })

    it('brands every page with the business name', () => {
      expect(buildPdfPageFooterTemplate('Aqua Nuqi')).toContain('Aqua Nuqi')
    })

    it('omits the name when absent or blank rather than printing an empty label', () => {
      for (const value of [undefined, '', '   ']) {
        const html = buildPdfPageFooterTemplate(value)
        expect(html).toContain('class="pageNumber"')
        expect(html).toMatch(/<span [^>]*><\/span>/)
      }
    })

    it('escapes business names so an ampersand cannot break the footer markup', () => {
      const html = buildPdfPageFooterTemplate('Ali & Sons <Water>')
      expect(html).toContain('Ali &amp; Sons &lt;Water&gt;')
      expect(html).not.toContain('<Water>')
    })
  })
})
