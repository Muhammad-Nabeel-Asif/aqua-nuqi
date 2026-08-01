import { describe, expect, it } from 'vitest'
import { toPaisa } from './money'
import { integerToWords, numberToWords, numberToWordsFromRupees } from './number-to-words'

describe('numberToWords (Pakistani lakh/crore)', () => {
  it('handles zero', () => {
    expect(numberToWords(toPaisa(0))).toBe('Rupees Zero Only')
  })

  it('handles Rs 1,250', () => {
    expect(numberToWords(toPaisa(1250))).toBe('Rupees One Thousand Two Hundred Fifty Only')
  })

  it('handles Rs 3,700', () => {
    expect(numberToWords(toPaisa(3700))).toBe('Rupees Three Thousand Seven Hundred Only')
  })

  it('handles Rs 1,25,000 (one lakh twenty-five thousand)', () => {
    expect(numberToWords(toPaisa(125_000))).toBe('Rupees One Lakh Twenty Five Thousand Only')
  })

  it('handles Rs 1,20,00,000 (one crore twenty lakh)', () => {
    expect(numberToWords(toPaisa(12_000_000))).toBe('Rupees One Crore Twenty Lakh Only')
  })

  it('includes paisa remainders', () => {
    expect(numberToWords(toPaisa('10.50'))).toBe('Rupees Ten and Fifty Paisa Only')
    expect(numberToWords(125_050)).toBe(
      'Rupees One Thousand Two Hundred Fifty and Fifty Paisa Only',
    )
  })

  it('handles large crore values', () => {
    expect(numberToWordsFromRupees(5_43_21_000)).toBe(
      'Rupees Five Crore Forty Three Lakh Twenty One Thousand Only',
    )
  })

  it('supports western numbering when requested', () => {
    expect(integerToWords(1_250_000, 'western')).toBe('One Million Two Hundred Fifty Thousand')
  })
})
