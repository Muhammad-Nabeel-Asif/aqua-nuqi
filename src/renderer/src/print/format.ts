import { formatDisplayDate, formatDisplayDateTime } from '@shared/date'
import { formatMoney, type Paisa } from '@shared/money'

export function fmtMoney(paisa: number, symbol = 'Rs', decimalPlaces = 0): string {
  return formatMoney(paisa as Paisa, { symbol, decimalPlaces })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return formatDisplayDate(iso.slice(0, 10))
  } catch {
    return iso
  }
}

export function fmtTs(iso: string): string {
  try {
    return formatDisplayDateTime(iso)
  } catch {
    return iso
  }
}
