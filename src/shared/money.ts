export type Paisa = number & { readonly __brand: 'Paisa' }

function asPaisa(n: number): Paisa {
  return n as Paisa
}

/** Round half up to nearest integer. */
export function roundHalfUp(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5)
}

/**
 * Convert rupees to integer paisa using decimal-string maths.
 * Avoids `n * 100` float drift (e.g. 1.005 → 100.4999… → 100).
 * Numbers are stringified first so V8's short representation is used.
 */
export function toPaisa(rupees: number | string): Paisa {
  const text = typeof rupees === 'string' ? rupees.replace(/,/g, '').trim() : String(rupees)
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text)
  if (!match) {
    throw new Error(`Invalid rupee amount: ${rupees}`)
  }
  const negative = match[1] === '-'
  const whole = match[2] ?? '0'
  const frac = match[3] ?? ''
  let paisa = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
  if (frac.length > 2 && Number(frac.charAt(2)) >= 5) {
    paisa += 1
  }
  return asPaisa(negative ? -paisa : paisa)
}

export function toRupees(p: Paisa): number {
  return p / 100
}

/**
 * Format paisa as a decimal rupee string using integer maths only.
 * Prefer this over `amount / 100` when writing exports (PDF/Excel).
 */
export function paisaToDecimalString(p: Paisa | number): string {
  const n = Math.trunc(Number(p))
  const neg = n < 0
  const abs = Math.abs(n)
  const whole = Math.trunc(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

export function formatMoney(
  p: Paisa,
  opts: { symbol?: string; decimalPlaces?: number } = {},
): string {
  const symbol = opts.symbol ?? 'Rs'
  const decimalPlaces = opts.decimalPlaces ?? 0
  const rupees = toRupees(p)
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(rupees)
  return `${symbol} ${formatted}`
}

export function parseMoneyInput(text: string): Paisa {
  const cleaned = text.replace(/[^\d.-]/g, '').trim()
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    throw new Error('Invalid money input')
  }
  return toPaisa(cleaned)
}

export function addPaisa(a: Paisa, b: Paisa): Paisa {
  return asPaisa(a + b)
}

export function subtractPaisa(a: Paisa, b: Paisa): Paisa {
  return asPaisa(a - b)
}

export function multiplyPaisa(unitPrice: Paisa, quantity: number): Paisa {
  return asPaisa(roundHalfUp(unitPrice * quantity))
}

export function zeroPaisa(): Paisa {
  return asPaisa(0)
}
