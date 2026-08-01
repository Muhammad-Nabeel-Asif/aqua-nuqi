import { describe, expect, it } from 'vitest'
import { toPaisa } from '@shared/money'
import { numberToWords } from '@shared/number-to-words'
import { invoicePdfFileName } from '@shared/slug'

describe('Phase 4 acceptance helpers', () => {
  it('acceptance #4 amount in words', () => {
    expect(numberToWords(toPaisa(0))).toBe('Rupees Zero Only')
    expect(numberToWords(toPaisa(1250))).toBe('Rupees One Thousand Two Hundred Fifty Only')
    expect(numberToWords(toPaisa(3700))).toBe('Rupees Three Thousand Seven Hundred Only')
    expect(numberToWords(toPaisa(125_000))).toBe('Rupees One Lakh Twenty Five Thousand Only')
    expect(numberToWords(toPaisa(12_000_000))).toBe('Rupees One Crore Twenty Lakh Only')
  })

  it('PDF naming matches INV-<no>-<code>-<slug>.pdf', () => {
    const name = invoicePdfFileName({
      invoiceNo: 'INV-2026-07-0042',
      customerCode: 'C-0100',
      customerName: 'Test Customer',
    })
    expect(name).toMatch(/^INV-2026-07-0042-C-0100-Test-Customer\.pdf$/)
  })
})
