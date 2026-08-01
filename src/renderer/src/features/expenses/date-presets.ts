import {
  currentPeriod,
  periodEnd,
  periodStart,
  previousPeriod,
  todayBusinessDate,
} from '@shared/date'

export type DatePreset = 'today' | 'this_month' | 'last_month' | 'this_year' | 'custom'

export function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const today = todayBusinessDate()
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'this_month') {
    const p = currentPeriod()
    return { from: periodStart(p), to: periodEnd(p) }
  }
  if (preset === 'last_month') {
    const p = previousPeriod(currentPeriod())
    return { from: periodStart(p), to: periodEnd(p) }
  }
  if (preset === 'this_year') {
    const y = today.slice(0, 4)
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  return { from: periodStart(currentPeriod()), to: today }
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit', label: 'Credit' },
  { value: 'other', label: 'Other' },
] as const

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  payroll: 'Payroll',
  purchase: 'Purchase',
  recurring: 'Recurring',
}
