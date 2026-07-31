import {
  format,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns'

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PERIOD_RE = /^\d{4}-\d{2}$/

export function isBusinessDate(value: string): boolean {
  if (!BUSINESS_DATE_RE.test(value)) return false
  const d = parse(value, 'yyyy-MM-dd', new Date())
  return isValid(d) && format(d, 'yyyy-MM-dd') === value
}

export function isPeriod(value: string): boolean {
  if (!PERIOD_RE.test(value)) return false
  const d = parse(`${value}-01`, 'yyyy-MM-dd', new Date())
  return isValid(d) && format(d, 'yyyy-MM') === value
}

export function todayBusinessDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function currentPeriod(): string {
  return format(new Date(), 'yyyy-MM')
}

export function periodFromDate(date: string): string {
  assertBusinessDate(date)
  return date.slice(0, 7)
}

export function assertBusinessDate(date: string): void {
  if (!isBusinessDate(date)) {
    throw new Error(`Invalid business date: ${date}`)
  }
}

export function assertPeriod(period: string): void {
  if (!isPeriod(period)) {
    throw new Error(`Invalid period: ${period}`)
  }
}

export function formatDisplayDate(date: string, pattern = 'dd-MM-yyyy'): string {
  assertBusinessDate(date)
  return format(parse(date, 'yyyy-MM-dd', new Date()), pattern)
}

export function formatDisplayDateTime(isoUtc: string, pattern = 'dd-MM-yyyy HH:mm'): string {
  const d = parseISO(isoUtc)
  if (!isValid(d)) throw new Error(`Invalid timestamp: ${isoUtc}`)
  return format(d, pattern)
}

export function nowIsoUtc(): string {
  return new Date().toISOString()
}

export function periodStart(period: string): string {
  assertPeriod(period)
  return `${period}-01`
}

export function periodEnd(period: string): string {
  assertPeriod(period)
  const start = parse(`${period}-01`, 'yyyy-MM-dd', new Date())
  return format(endOfMonth(start), 'yyyy-MM-dd')
}

export function addBusinessMonths(date: string, months: number): string {
  assertBusinessDate(date)
  const d = parse(date, 'yyyy-MM-dd', new Date())
  return format(addMonths(d, months), 'yyyy-MM-dd')
}

export function startOfBusinessMonth(date: string): string {
  assertBusinessDate(date)
  return format(startOfMonth(parse(date, 'yyyy-MM-dd', new Date())), 'yyyy-MM-dd')
}

export function previousPeriod(period: string): string {
  assertPeriod(period)
  const d = parse(`${period}-01`, 'yyyy-MM-dd', new Date())
  return format(subMonths(d, 1), 'yyyy-MM')
}
