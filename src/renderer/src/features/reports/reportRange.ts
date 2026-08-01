import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from 'date-fns'

export type RangeKind = 'month' | 'quarter' | 'year' | 'custom'

export function defaultMonthPeriod(): string {
  return format(new Date(), 'yyyy-MM')
}

export function resolveLocalRange(
  kind: RangeKind,
  input: { period?: string; year?: number; from?: string; to?: string } = {},
): { from: string; to: string; label: string } {
  if (kind === 'custom') {
    const from = input.from ?? format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const to = input.to ?? format(endOfMonth(new Date()), 'yyyy-MM-dd')
    return { from, to, label: `${from} to ${to}` }
  }
  const date = input.period
    ? new Date(`${input.period}-01T00:00:00`)
    : new Date(input.year ?? new Date().getFullYear(), 0, 1)
  const start =
    kind === 'month'
      ? startOfMonth(date)
      : kind === 'quarter'
        ? startOfQuarter(date)
        : startOfYear(date)
  const end =
    kind === 'month' ? endOfMonth(date) : kind === 'quarter' ? endOfQuarter(date) : endOfYear(date)
  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
    label: format(start, kind === 'year' ? 'yyyy' : 'MMM yyyy'),
  }
}
