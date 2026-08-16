import { todayBusinessDate } from '@shared/date'

export type ReportRow = Record<string, unknown>

export type ReportTableKey =
  | 'salesSummary'
  | 'customerWiseSales'
  | 'areaRoutePerformance'
  | 'employeeDelivery'
  | 'customerActivity'
  | 'collection'
  | 'expenses'
  | 'costPerBottle'
  | 'bottleLoss'
  | 'tripVariance'
  | 'stockMovements'
  | 'receivablesAgeing'
  | 'profitAndLoss'

export function asRows(value: unknown): ReportRow[] {
  return Array.isArray(value)
    ? value.filter((v): v is ReportRow => typeof v === 'object' && v !== null)
    : []
}

export function isHiddenReportColumn(key: string): boolean {
  if (key === 'id' || key === 'uuid') return true
  return /Id$/.test(key) || /ID$/.test(key)
}

const HEADER_LABELS: Record<string, string> = {
  waterSales: 'Water sales',
  otherCharges: 'Other charges',
  discountsAndWriteOffs: 'Discounts and write-offs',
  walkInSales: 'Counter sales',
  netRevenue: 'Net revenue',
  cashVariance: 'Cash difference',
  bottleVariance: 'Bottle difference',
  totalBottleVariance: 'Bottle difference',
  totalCashVariance: 'Cash difference',
  averagePerDelivery: 'Average per delivery',
  averageRevenuePerCustomer: 'Average per customer',
  cashCollected: 'Cash collected',
  paymentsTotal: 'Payments',
  walkInCash: 'Counter cash',
  costPerBottle: 'Cost per bottle',
  bottleState: 'Bottle state',
  joinedOn: 'Joined on',
  customersServed: 'Customers served',
  activity: 'Activity',
  source: 'Source',
  kind: 'Kind',
  totalOutstanding: 'Still unpaid',
  employeeAdvances: 'Salary advances',
}

export function humanHeader(key: string): string {
  if (HEADER_LABELS[key]) return HEADER_LABELS[key]
  return key
    .replace(/_/g, ' ')
    .replace(/[A-Z]/g, (m) => ` ${m}`)
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** Pick the array that should render as the main table for each report. */
export function reportTableRows(report: ReportTableKey, data: ReportRow): ReportRow[] {
  switch (report) {
    case 'collection':
      return asRows(data.byDay)
    case 'customerActivity':
      return [
        ...asRows(data.newCustomers).map((row) => ({ activity: 'New', ...row })),
        ...asRows(data.stopped).map((row) => ({ activity: 'Stopped', ...row })),
        ...asRows(data.paused).map((row) => ({ activity: 'Paused', ...row })),
      ]
    case 'bottleLoss':
      return [
        ...asRows(data.byReason).map((row) => ({ source: 'Plant / van', ...row })),
        ...asRows(data.customerLoss).map((row) => ({ source: 'With customer', ...row })),
      ]
    default:
      return asRows(data.items ?? data.byCategory ?? data.outstanding ?? data.trips)
  }
}

export function visibleReportKeys(rows: ReportRow[]): string[] {
  return Object.keys(rows[0] ?? {}).filter((key) => !isHiddenReportColumn(key))
}

/** Ageing is "as of today" even when the month filter's end is still in the future. */
export function ageingAsOf(rangeTo: string, today = todayBusinessDate()): string {
  return rangeTo < today ? rangeTo : today
}
