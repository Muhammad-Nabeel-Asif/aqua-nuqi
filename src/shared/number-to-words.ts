import type { Paisa } from './money'

export type NumberingSystem = 'lakh_crore' | 'western'

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const

function belowThousand(n: number): string {
  if (n < 0 || n >= 1000) throw new Error(`belowThousand expects 0..999, got ${n}`)
  if (n === 0) return ''
  if (n < 20) return ONES[n]!
  if (n < 100) {
    const t = Math.floor(n / 10)
    const o = n % 10
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t]!
  }
  const h = Math.floor(n / 100)
  const rest = n % 100
  return rest ? `${ONES[h]} Hundred ${belowThousand(rest)}` : `${ONES[h]} Hundred`
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Convert a non-negative whole-rupee amount to English words (no currency suffix). */
export function integerToWords(n: number, system: NumberingSystem = 'lakh_crore'): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`integerToWords expects a non-negative integer, got ${n}`)
  }
  if (n === 0) return 'Zero'

  if (system === 'western') {
    const parts: string[] = []
    let rem = n
    const billion = Math.floor(rem / 1_000_000_000)
    rem %= 1_000_000_000
    const million = Math.floor(rem / 1_000_000)
    rem %= 1_000_000
    const thousand = Math.floor(rem / 1000)
    rem %= 1000
    if (billion) parts.push(`${belowThousand(billion)} Billion`)
    if (million) parts.push(`${belowThousand(million)} Million`)
    if (thousand) parts.push(`${belowThousand(thousand)} Thousand`)
    if (rem) parts.push(belowThousand(rem))
    return joinParts(parts)
  }

  // Pakistani / Indian: crore / lakh / thousand
  const parts: string[] = []
  let rem = n
  const crore = Math.floor(rem / 10_000_000)
  rem %= 10_000_000
  const lakh = Math.floor(rem / 100_000)
  rem %= 100_000
  const thousand = Math.floor(rem / 1000)
  rem %= 1000
  if (crore) parts.push(`${integerToWords(crore, 'lakh_crore')} Crore`)
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`)
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`)
  if (rem) parts.push(belowThousand(rem))
  return joinParts(parts)
}

/**
 * Amount in words for a paisa integer, e.g.
 * `Rupees Three Thousand Seven Hundred Only` or with paisa remainder.
 */
export function numberToWords(
  paisa: Paisa | number,
  opts: { system?: NumberingSystem; currencyWord?: string } = {},
): string {
  const system = opts.system ?? 'lakh_crore'
  const currencyWord = opts.currencyWord ?? 'Rupees'
  const negative = paisa < 0
  const abs = Math.abs(Math.trunc(paisa))
  const rupees = Math.floor(abs / 100)
  const remainderPaisa = abs % 100

  const rupeeWords = integerToWords(rupees, system)
  let body: string
  if (remainderPaisa === 0) {
    body = `${currencyWord} ${rupeeWords} Only`
  } else {
    const paisaWords = integerToWords(remainderPaisa, system)
    body = `${currencyWord} ${rupeeWords} and ${paisaWords} Paisa Only`
  }
  return negative ? `Minus ${body}` : body
}

/** Convenience for tests / display using rupee amounts as numbers. */
export function numberToWordsFromRupees(
  rupees: number,
  opts: { system?: NumberingSystem; currencyWord?: string } = {},
): string {
  const whole = Math.trunc(rupees)
  const frac = Math.round((Math.abs(rupees) - Math.abs(whole)) * 100)
  const sign = rupees < 0 ? -1 : 1
  return numberToWords(sign * (Math.abs(whole) * 100 + frac), opts)
}
