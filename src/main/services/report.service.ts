import { and, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import {
  customerAdjustments,
  customerBalances,
  customers,
  employees,
  payments,
} from '@main/db/schema'
import { cachedReport } from '@main/lib/report-cache'
import {
  assertBusinessDate,
  assertPeriod,
  periodEnd,
  periodStart,
  previousPeriod,
  todayBusinessDate,
} from '@shared/date'
import type { ExpenseService } from './expense.service'
import type { ReceivablesService } from './receivables.service'
import type { StockService } from './stock.service'
import type { TripService } from './trip.service'

export type ReportBasis = 'accrual' | 'cash'

export type DateRange = { from: string; to: string }

export type ProfitLossResult = {
  from: string
  to: string
  basis: ReportBasis
  basisExplanation: string
  revenue: {
    waterSales: number
    otherCharges: number
    discountsAndWriteOffs: number
    netRevenue: number
    walkInSales: number
  }
  excluded: {
    depositsReceived: number
    depositsRefunded: number
    depositPaymentsTagged: number
    customerCreditBalances: number
  }
  expenses: Array<{
    categoryId: number
    categoryName: string
    total: number
    count: number
    isSalaries: boolean
    isEmployeeAdvance: boolean
  }>
  totalExpenses: number
  netProfit: number
  marginPercent: number | null
  previousPeriod: {
    from: string
    to: string
    netRevenue: number
    totalExpenses: number
    netProfit: number
  } | null
  samePeriodLastYear: {
    from: string
    to: string
    netRevenue: number
    totalExpenses: number
    netProfit: number
  } | null
}

export type DashboardSnapshot = {
  asOf: string
  today: {
    bottlesDelivered: number
    customersServed: number
    cashCollected: number
    missedScheduled: number
  }
  month: {
    period: string
    bottlesDelivered: number
    revenueAccrual: number
    revenueCash: number
    expenses: number
    profitAccrual: number
    profitCash: number
    pctChangeBottles: number | null
    pctChangeRevenueAccrual: number | null
    pctChangeExpenses: number | null
    pctChangeProfitAccrual: number | null
  }
  assets: {
    totalOutstanding: number
    ageingBuckets: Record<'current' | '1-30' | '31-60' | '60+', number>
    customersInCredit: number
    totalCredit: number
    bottlesWithCustomers: number
    filledStockAtPlant: number
  }
  charts: {
    last12Months: Array<{
      period: string
      revenueAccrual: number
      revenueCash: number
      expenses: number
      profitAccrual: number
      profitCash: number
    }>
    dailyBottlesThisMonth: Array<{ date: string; bottles: number }>
  }
  actions: {
    topOverdue: Array<{
      customerId: number
      code: string
      name: string
      balance: number
      daysOverdue: number
    }>
    noDeliveryDays: Array<{
      customerId: number
      code: string
      name: string
      daysSince: number | null
      lastDeliveryDate: string | null
    }>
    recurringNotRecorded: Array<{
      id: number
      name: string
      amount: number
      vendorName: string | null
    }>
    tripVariancesThisWeek: Array<{
      tripId: number
      tripDate: string
      employeeName: string | null
      cashVariance: number
      bottleVariance: number
    }>
    backupStale: boolean
    backupLastSuccessAt: string | null
  }
}

const ACCRUAL_EXPLANATION =
  'Accrual: counts money you billed this period, whether or not it was paid.'
const CASH_EXPLANATION = 'Cash: counts money you actually received this period.'

function monthsBetween(from: string, to: string): string[] {
  assertBusinessDate(from)
  assertBusinessDate(to)
  const out: string[] = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const endY = Number(to.slice(0, 4))
  const endM = Number(to.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function shiftRangeYears(from: string, to: string, years: number): DateRange {
  const fy = Number(from.slice(0, 4)) + years
  const ty = Number(to.slice(0, 4)) + years
  return {
    from: `${fy}${from.slice(4)}`,
    to: `${ty}${to.slice(4)}`,
  }
}

function previousEquivalentRange(from: string, to: string): DateRange {
  // Same-length window ending the day before `from`.
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T00:00:00`)
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (days - 1))
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(prevFrom), to: fmt(prevTo) }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

export function createReportService(
  db: AppDatabase,
  raw: RawDatabase,
  deps: {
    expenses: ExpenseService
    receivables: ReceivablesService
    stock: StockService
    trips: TripService
  },
) {
  // ─── primitives (also used by tests / other reports) ─────────────────────

  /** Accrual water + charges net of discounts for issued invoices overlapping the range via period or issue_date. */
  function accrualInvoiceBreakdown(range: DateRange): {
    waterSales: number
    otherCharges: number
    discountsAndWriteOffs: number
    netRevenue: number
  } {
    const months = monthsBetween(range.from, range.to)
    const periodPlaceholders = months.map(() => '?').join(',')
    // Prefer period membership (canonical §J). Also include ad-hoc invoices with null period by issue_date.
    const row = raw
      .prepare(
        `SELECT
           coalesce(sum(deliveries_total), 0) AS water,
           coalesce(sum(charges_total), 0) AS charges,
           coalesce(sum(discount_total), 0) AS discounts,
           coalesce(sum(invoice_total), 0) AS net
         FROM invoices
         WHERE status IN ('issued','partially_paid','paid')
           AND (
             (period IS NOT NULL AND period IN (${periodPlaceholders || "''"}))
             OR (period IS NULL AND issue_date >= ? AND issue_date <= ?)
           )`,
      )
      .get(...(months.length ? months : ['__none__']), range.from, range.to) as {
      water: number
      charges: number
      discounts: number
      net: number
    }
    return {
      waterSales: Number(row.water),
      otherCharges: Number(row.charges),
      discountsAndWriteOffs: Number(row.discounts),
      netRevenue: Number(row.net),
    }
  }

  /** Walk-in recorded delivery amounts in range (included in revenue, never in receivables). */
  function walkInSales(range: DateRange): { amount: number; cashCollected: number; qty: number } {
    const row = raw
      .prepare(
        `SELECT
           coalesce(sum(d.amount), 0) AS amount,
           coalesce(sum(d.cash_collected), 0) AS cash,
           coalesce(sum(d.quantity), 0) AS qty
         FROM deliveries d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.status = 'recorded'
           AND c.customer_type = 'walk_in'
           AND d.delivery_date >= ? AND d.delivery_date <= ?`,
      )
      .get(range.from, range.to) as { amount: number; cash: number; qty: number }
    return {
      amount: Number(row.amount),
      cashCollected: Number(row.cash),
      qty: Number(row.qty),
    }
  }

  /** Active payments in range, excluding deposit-tagged notes (liability, not income). */
  function cashCollections(range: DateRange): number {
    const rows = db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, 'active'),
          gte(payments.paymentDate, range.from),
          lte(payments.paymentDate, range.to),
        ),
      )
      .all()
      .filter((p) => !p.notes?.startsWith('[deposit]'))
    return rows.reduce((s, r) => s + r.amount, 0)
  }

  function depositTaggedPayments(range: DateRange): number {
    const rows = db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, 'active'),
          gte(payments.paymentDate, range.from),
          lte(payments.paymentDate, range.to),
        ),
      )
      .all()
      .filter((p) => p.notes?.startsWith('[deposit]'))
    return rows.reduce((s, r) => s + r.amount, 0)
  }

  function depositAdjustments(range: DateRange): { received: number; refunded: number } {
    const rows = db
      .select()
      .from(customerAdjustments)
      .where(
        and(
          eq(customerAdjustments.status, 'active'),
          gte(customerAdjustments.adjustmentDate, range.from),
          lte(customerAdjustments.adjustmentDate, range.to),
        ),
      )
      .all()
    let received = 0
    let refunded = 0
    for (const r of rows) {
      if (r.kind === 'deposit_received') received += r.amount
      else if (r.kind === 'deposit_refunded') refunded += r.amount
    }
    return { received, refunded }
  }

  function expensesTotal(range: DateRange): number {
    return deps.expenses.summaryByCategory(range.from, range.to).total
  }

  function bottlesDelivered(range: DateRange): number {
    const row = raw
      .prepare(
        `SELECT coalesce(sum(quantity), 0) AS qty
         FROM deliveries
         WHERE status = 'recorded'
           AND delivery_date >= ? AND delivery_date <= ?`,
      )
      .get(range.from, range.to) as { qty: number }
    return Number(row.qty)
  }

  /**
   * Canonical accrual revenue for a date range:
   * invoice totals (issued+) + walk-in sales. Deposits never included.
   */
  function revenueAccrual(range: DateRange): number {
    const inv = accrualInvoiceBreakdown(range)
    const walk = walkInSales(range)
    return inv.netRevenue + walk.amount
  }

  /**
   * Canonical cash revenue for a date range:
   * active payments (ex deposit-tagged) + walk-in cash collected.
   */
  function revenueCash(range: DateRange): number {
    return cashCollections(range) + walkInSales(range).cashCollected
  }

  function profitAndLoss(
    range: DateRange,
    basis: ReportBasis,
    opts: { compare?: boolean } = {},
  ): ProfitLossResult {
    return cachedReport('profitAndLoss', { ...range, basis, compare: opts.compare ?? true }, () => {
      assertBusinessDate(range.from)
      assertBusinessDate(range.to)
      const walk = walkInSales(range)
      const deposits = depositAdjustments(range)
      const depositPay = depositTaggedPayments(range)

      let waterSales: number
      let otherCharges: number
      let discountsAndWriteOffs: number
      let netRevenue: number

      if (basis === 'accrual') {
        const inv = accrualInvoiceBreakdown(range)
        waterSales = inv.waterSales + walk.amount
        otherCharges = inv.otherCharges
        discountsAndWriteOffs = inv.discountsAndWriteOffs
        netRevenue = inv.netRevenue + walk.amount
      } else {
        // Cash basis: total received; breakdown collapses to collections.
        waterSales = cashCollections(range) + walk.cashCollected
        otherCharges = 0
        discountsAndWriteOffs = 0
        netRevenue = waterSales
      }

      const catSummary = deps.expenses.summaryByCategory(range.from, range.to)
      const expenseRows = catSummary.items.map((i) => ({
        categoryId: i.categoryId,
        categoryName: i.categoryName,
        total: i.total,
        count: i.count,
        isSalaries: i.categoryName === 'Salaries',
        isEmployeeAdvance: i.categoryName === 'Employee Advance',
      }))
      // Largest first
      expenseRows.sort((a, b) => b.total - a.total)
      const totalExp = catSummary.total
      const netProfit = netRevenue - totalExp
      const marginPercent =
        netRevenue === 0 ? null : Math.round((netProfit / netRevenue) * 1000) / 10

      const creditRows = db
        .select({ balance: customerBalances.balance })
        .from(customerBalances)
        .innerJoin(customers, eq(customers.id, customerBalances.customerId))
        .where(
          and(
            isNull(customers.deletedAt),
            ne(customers.customerType, 'walk_in'),
            sql`${customerBalances.balance} < 0`,
          ),
        )
        .all()
      const customerCreditBalances = creditRows.reduce((s, r) => s + Math.abs(r.balance), 0)

      let previous: ProfitLossResult['previousPeriod'] = null
      let lastYear: ProfitLossResult['samePeriodLastYear'] = null
      if (opts.compare !== false) {
        const prevRange = previousEquivalentRange(range.from, range.to)
        const prevPl = profitAndLoss(prevRange, basis, { compare: false })
        previous = {
          from: prevRange.from,
          to: prevRange.to,
          netRevenue: prevPl.revenue.netRevenue,
          totalExpenses: prevPl.totalExpenses,
          netProfit: prevPl.netProfit,
        }
        const lyRange = shiftRangeYears(range.from, range.to, -1)
        const lyPl = profitAndLoss(lyRange, basis, { compare: false })
        lastYear = {
          from: lyRange.from,
          to: lyRange.to,
          netRevenue: lyPl.revenue.netRevenue,
          totalExpenses: lyPl.totalExpenses,
          netProfit: lyPl.netProfit,
        }
      }

      return {
        from: range.from,
        to: range.to,
        basis,
        basisExplanation: basis === 'accrual' ? ACCRUAL_EXPLANATION : CASH_EXPLANATION,
        revenue: {
          waterSales,
          otherCharges,
          discountsAndWriteOffs,
          netRevenue,
          walkInSales: basis === 'accrual' ? walk.amount : walk.cashCollected,
        },
        excluded: {
          depositsReceived: deposits.received,
          depositsRefunded: deposits.refunded,
          depositPaymentsTagged: depositPay,
          customerCreditBalances,
        },
        expenses: expenseRows,
        totalExpenses: totalExp,
        netProfit,
        marginPercent,
        previousPeriod: previous,
        samePeriodLastYear: lastYear,
      }
    })
  }

  function expenseDrilldown(
    range: DateRange,
    categoryId: number,
  ): {
    items: Array<{
      id: number
      expenseDate: string
      amount: number
      description: string | null
      vendorName: string | null
      source: string
    }>
  } {
    return cachedReport('expenseDrilldown', { ...range, categoryId }, () => {
      const list = deps.expenses.listExpenses({
        from: range.from,
        to: range.to,
        categoryIds: [categoryId],
        limit: 5000,
      })
      return {
        items: list.items.map((e) => ({
          id: e.id,
          expenseDate: e.expenseDate,
          amount: e.amount,
          description: e.description,
          vendorName: e.vendorName,
          source: e.source,
        })),
      }
    })
  }

  // ─── Sales reports ───────────────────────────────────────────────────────

  function salesSummary(input: {
    from: string
    to: string
    groupBy: 'day' | 'month'
    areaId?: number
    routeId?: number
    employeeId?: number
    customerType?: string
  }) {
    return cachedReport('salesSummary', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const groupExpr =
        input.groupBy === 'day' ? `d.delivery_date` : `substr(d.delivery_date, 1, 7)`
      const params: Array<string | number> = [input.from, input.to]
      let filter = `d.status = 'recorded' AND d.delivery_date >= ? AND d.delivery_date <= ?`
      if (input.areaId != null) {
        filter += ` AND c.area_id = ?`
        params.push(input.areaId)
      }
      if (input.routeId != null) {
        filter += ` AND c.route_id = ?`
        params.push(input.routeId)
      }
      if (input.employeeId != null) {
        filter += ` AND d.employee_id = ?`
        params.push(input.employeeId)
      }
      if (input.customerType) {
        filter += ` AND c.customer_type = ?`
        params.push(input.customerType)
      }
      const rows = raw
        .prepare(
          `SELECT ${groupExpr} AS bucket,
                  coalesce(sum(d.quantity), 0) AS units,
                  coalesce(sum(d.amount), 0) AS value,
                  count(distinct d.customer_id) AS customers
           FROM deliveries d
           JOIN customers c ON c.id = d.customer_id
           WHERE ${filter}
           GROUP BY bucket
           ORDER BY bucket`,
        )
        .all(...params) as Array<{
        bucket: string
        units: number
        value: number
        customers: number
      }>

      const items = rows.map((r) => ({
        bucket: r.bucket,
        units: Number(r.units),
        value: Number(r.value),
        customers: Number(r.customers),
      }))
      return {
        from: input.from,
        to: input.to,
        groupBy: input.groupBy,
        items,
        totals: {
          units: items.reduce((s, i) => s + i.units, 0),
          value: items.reduce((s, i) => s + i.value, 0),
        },
      }
    })
  }

  function customerWiseSales(input: {
    from: string
    to: string
    topN?: number
    areaId?: number
    routeId?: number
  }) {
    return cachedReport('customerWiseSales', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const params: Array<string | number> = [input.from, input.to]
      let filter = `d.status = 'recorded' AND d.delivery_date >= ? AND d.delivery_date <= ?
                    AND c.customer_type != 'walk_in' AND c.deleted_at IS NULL`
      if (input.areaId != null) {
        filter += ` AND c.area_id = ?`
        params.push(input.areaId)
      }
      if (input.routeId != null) {
        filter += ` AND c.route_id = ?`
        params.push(input.routeId)
      }
      const rows = raw
        .prepare(
          `SELECT c.id AS customer_id, c.code, c.name,
                  coalesce(sum(d.quantity), 0) AS units,
                  coalesce(sum(d.amount), 0) AS revenue,
                  count(distinct d.delivery_date) AS delivery_days
           FROM deliveries d
           JOIN customers c ON c.id = d.customer_id
           WHERE ${filter}
           GROUP BY c.id
           ORDER BY revenue DESC`,
        )
        .all(...params) as Array<{
        customer_id: number
        code: string
        name: string
        units: number
        revenue: number
        delivery_days: number
      }>

      let items = rows.map((r) => ({
        customerId: r.customer_id,
        code: r.code,
        name: r.name,
        units: Number(r.units),
        revenue: Number(r.revenue),
        deliveryDays: Number(r.delivery_days),
        averagePerDelivery:
          Number(r.delivery_days) > 0 ? Math.round(Number(r.revenue) / Number(r.delivery_days)) : 0,
      }))
      if (input.topN != null && input.topN > 0) items = items.slice(0, input.topN)
      return {
        from: input.from,
        to: input.to,
        items,
        totals: {
          units: items.reduce((s, i) => s + i.units, 0),
          revenue: items.reduce((s, i) => s + i.revenue, 0),
        },
      }
    })
  }

  function areaRoutePerformance(input: { from: string; to: string; groupBy: 'area' | 'route' }) {
    return cachedReport('areaRoutePerformance', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const joinCol = input.groupBy === 'area' ? 'area_id' : 'route_id'
      const nameTable = input.groupBy === 'area' ? 'areas' : 'routes'
      const rows = raw
        .prepare(
          `SELECT g.id AS group_id, g.name AS group_name,
                  coalesce(sum(d.quantity), 0) AS units,
                  coalesce(sum(d.amount), 0) AS revenue,
                  count(distinct CASE WHEN d.id IS NOT NULL THEN c.id END) AS active_customers
           FROM ${nameTable} g
           LEFT JOIN customers c ON c.${joinCol} = g.id AND c.deleted_at IS NULL AND c.customer_type != 'walk_in'
           LEFT JOIN deliveries d ON d.customer_id = c.id
             AND d.status = 'recorded'
             AND d.delivery_date >= ? AND d.delivery_date <= ?
           WHERE g.deleted_at IS NULL
           GROUP BY g.id
           ORDER BY revenue DESC`,
        )
        .all(input.from, input.to) as Array<{
        group_id: number
        group_name: string
        units: number
        revenue: number
        active_customers: number
      }>

      const items = rows.map((r) => {
        const active = Number(r.active_customers)
        const revenue = Number(r.revenue)
        return {
          id: r.group_id,
          name: r.group_name,
          units: Number(r.units),
          revenue,
          activeCustomers: active,
          averageRevenuePerCustomer: active > 0 ? Math.round(revenue / active) : 0,
        }
      })
      return { from: input.from, to: input.to, groupBy: input.groupBy, items }
    })
  }

  function employeeDeliveryReport(input: { from: string; to: string }) {
    return cachedReport('employeeDeliveryReport', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const rows = raw
        .prepare(
          `SELECT e.id AS employee_id, e.name AS employee_name,
                  coalesce(sum(d.quantity), 0) AS units,
                  count(distinct d.customer_id) AS customers_served,
                  coalesce(sum(d.cash_collected), 0) AS cash_collected
           FROM employees e
           LEFT JOIN deliveries d ON d.employee_id = e.id
             AND d.status = 'recorded'
             AND d.delivery_date >= ? AND d.delivery_date <= ?
           WHERE e.deleted_at IS NULL
           GROUP BY e.id
           ORDER BY units DESC`,
        )
        .all(input.from, input.to) as Array<{
        employee_id: number
        employee_name: string
        units: number
        customers_served: number
        cash_collected: number
      }>

      const variances = deps.trips.employeeVarianceSummary(input.from, input.to)
      const varMap = new Map(variances.items.map((v) => [v.employeeId, v]))

      return {
        from: input.from,
        to: input.to,
        items: rows.map((r) => {
          const v = varMap.get(r.employee_id)
          return {
            employeeId: r.employee_id,
            employeeName: r.employee_name,
            units: Number(r.units),
            customersServed: Number(r.customers_served),
            cashCollected: Number(r.cash_collected),
            cashVariance: v?.totalCashVariance ?? 0,
            bottleVariance: v?.totalBottleVariance ?? 0,
          }
        }),
      }
    })
  }

  function customerActivity(input: { from: string; to: string }) {
    return cachedReport('customerActivity', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const prev = previousEquivalentRange(input.from, input.to)

      const newCustomers = db
        .select({
          id: customers.id,
          code: customers.code,
          name: customers.name,
          joinedOn: customers.joinedOn,
        })
        .from(customers)
        .where(
          and(
            isNull(customers.deletedAt),
            ne(customers.customerType, 'walk_in'),
            gte(customers.joinedOn, input.from),
            lte(customers.joinedOn, input.to),
          ),
        )
        .all()

      const deliveredThis = new Set(
        (
          raw
            .prepare(
              `SELECT DISTINCT customer_id FROM deliveries
               WHERE status = 'recorded' AND delivery_date >= ? AND delivery_date <= ?`,
            )
            .all(input.from, input.to) as Array<{ customer_id: number }>
        ).map((r) => r.customer_id),
      )
      const deliveredPrev = (
        raw
          .prepare(
            `SELECT DISTINCT d.customer_id, c.code, c.name
             FROM deliveries d
             JOIN customers c ON c.id = d.customer_id
             WHERE d.status = 'recorded'
               AND d.delivery_date >= ? AND d.delivery_date <= ?
               AND c.customer_type != 'walk_in' AND c.deleted_at IS NULL`,
          )
          .all(prev.from, prev.to) as Array<{ customer_id: number; code: string; name: string }>
      ).filter((r) => !deliveredThis.has(r.customer_id))

      const paused = db
        .select({
          id: customers.id,
          code: customers.code,
          name: customers.name,
          status: customers.status,
        })
        .from(customers)
        .where(
          and(
            isNull(customers.deletedAt),
            eq(customers.status, 'paused'),
            ne(customers.customerType, 'walk_in'),
          ),
        )
        .all()

      return {
        from: input.from,
        to: input.to,
        newCustomers: newCustomers.map((c) => ({
          customerId: c.id,
          code: c.code,
          name: c.name,
          joinedOn: c.joinedOn,
        })),
        stopped: deliveredPrev.map((r) => ({
          customerId: r.customer_id,
          code: r.code,
          name: r.name,
        })),
        paused: paused.map((c) => ({
          customerId: c.id,
          code: c.code,
          name: c.name,
        })),
        churnCount: deliveredPrev.length,
      }
    })
  }

  function customerConsumptionTrend(customerId: number, months = 6) {
    return cachedReport('customerConsumptionTrend', { customerId, months }, () => {
      const asOf = todayBusinessDate()
      const endPeriod = asOf.slice(0, 7)
      const periods: string[] = []
      let p = endPeriod
      for (let i = 0; i < months; i++) {
        periods.unshift(p)
        p = previousPeriod(p)
      }
      const items = periods.map((period) => {
        const row = raw
          .prepare(
            `SELECT coalesce(sum(quantity), 0) AS qty, coalesce(sum(amount), 0) AS amount
             FROM deliveries
             WHERE customer_id = ? AND status = 'recorded'
               AND delivery_date >= ? AND delivery_date <= ?`,
          )
          .get(customerId, periodStart(period), periodEnd(period)) as {
          qty: number
          amount: number
        }
        return {
          period,
          units: Number(row.qty),
          revenue: Number(row.amount),
        }
      })
      return { customerId, items }
    })
  }

  // ─── Money reports ───────────────────────────────────────────────────────

  function receivablesAgeing(asOf?: string) {
    return cachedReport('receivablesAgeing', { asOf: asOf ?? todayBusinessDate() }, () => {
      const report = deps.receivables.report(asOf)
      const byArea = new Map<
        string,
        { areaName: string; total: number; count: number; buckets: Record<string, number> }
      >()
      for (const row of report.outstanding) {
        const key = row.areaName ?? '(No area)'
        let agg = byArea.get(key)
        if (!agg) {
          agg = {
            areaName: key,
            total: 0,
            count: 0,
            buckets: { current: 0, '1-30': 0, '31-60': 0, '60+': 0 },
          }
          byArea.set(key, agg)
        }
        agg.total += row.balance
        agg.count += 1
        agg.buckets[row.ageingBucket] = (agg.buckets[row.ageingBucket] ?? 0) + row.balance
      }
      return {
        ...report,
        byArea: [...byArea.values()].sort((a, b) => b.total - a.total),
      }
    })
  }

  function collectionReport(input: { from: string; to: string }) {
    return cachedReport('collectionReport', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const rows = db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.status, 'active'),
            gte(payments.paymentDate, input.from),
            lte(payments.paymentDate, input.to),
          ),
        )
        .all()
        .filter((p) => !p.notes?.startsWith('[deposit]'))

      const byMethod = new Map<string, number>()
      const byDay = new Map<string, number>()
      const byEmployee = new Map<number, { employeeId: number; name: string; total: number }>()

      for (const p of rows) {
        byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
        byDay.set(p.paymentDate, (byDay.get(p.paymentDate) ?? 0) + p.amount)
        if (p.receivedByEmployeeId != null) {
          const emp = db
            .select()
            .from(employees)
            .where(eq(employees.id, p.receivedByEmployeeId))
            .get()
          const cur = byEmployee.get(p.receivedByEmployeeId) ?? {
            employeeId: p.receivedByEmployeeId,
            name: emp?.name ?? `#${p.receivedByEmployeeId}`,
            total: 0,
          }
          cur.total += p.amount
          byEmployee.set(p.receivedByEmployeeId, cur)
        }
      }

      const walk = walkInSales(input)
      return {
        from: input.from,
        to: input.to,
        total: rows.reduce((s, r) => s + r.amount, 0) + walk.cashCollected,
        paymentsTotal: rows.reduce((s, r) => s + r.amount, 0),
        walkInCash: walk.cashCollected,
        byMethod: [...byMethod.entries()]
          .map(([method, total]) => ({ method, total }))
          .sort((a, b) => b.total - a.total),
        byDay: [...byDay.entries()]
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => (a.date < b.date ? -1 : 1)),
        byEmployee: [...byEmployee.values()].sort((a, b) => b.total - a.total),
        count: rows.length,
      }
    })
  }

  function expenseReport(input: { from: string; to: string }) {
    return cachedReport('expenseReport', input, () => {
      const byCategory = deps.expenses.summaryByCategory(input.from, input.to)
      const byMonth = deps.expenses.summaryByMonth(input.from, input.to)
      const insights = deps.expenses.insights(input.from, input.to)
      return {
        from: input.from,
        to: input.to,
        byCategory: byCategory.items,
        total: byCategory.total,
        byMonth: byMonth.items,
        topVendors: insights.topVendors,
      }
    })
  }

  function costPerBottle(input: { from: string; to: string }) {
    return cachedReport('costPerBottle', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const months = monthsBetween(input.from, input.to)
      const items = months.map((period) => {
        const range = { from: periodStart(period), to: periodEnd(period) }
        const exp = expensesTotal(range)
        const bottles = bottlesDelivered(range)
        const rev = revenueAccrual(range)
        const cost = bottles > 0 ? Math.round(exp / bottles) : null
        const avgRevenue = bottles > 0 ? Math.round(rev / bottles) : null
        return {
          period,
          expenses: exp,
          bottles,
          costPerBottle: cost,
          averageRevenuePerBottle: avgRevenue,
          marginPerBottle: cost != null && avgRevenue != null ? avgRevenue - cost : null,
        }
      })
      return { from: input.from, to: input.to, items }
    })
  }

  // ─── Operations ──────────────────────────────────────────────────────────

  function bottlesOutReport(filters: {
    search?: string
    routeId?: number
    areaId?: number
    minBottles?: number
    shortfallOnly?: boolean
    noReturnDays?: number
  }) {
    return cachedReport('bottlesOut', filters, () => deps.stock.listBottlesOut(filters))
  }

  function bottleLossReport(input: { from: string; to: string }) {
    return cachedReport('bottleLoss', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      // Scrapped / lost at plant or van (exclude reversals noted as such)
      const scrapRows = raw
        .prepare(
          `SELECT reason, bottle_state, coalesce(sum(quantity), 0) AS qty
           FROM stock_movements
           WHERE to_location = 'scrap'
             AND movement_date >= ? AND movement_date <= ?
             AND (notes IS NULL OR notes NOT LIKE '[reversal of #%')
             AND reason IN ('damaged','lost','scrapped')
           GROUP BY reason, bottle_state`,
        )
        .all(input.from, input.to) as Array<{ reason: string; bottle_state: string; qty: number }>

      // Customer lost/damaged via adjustments
      const custLoss = raw
        .prepare(
          `SELECT kind, coalesce(sum(coalesce(quantity, 0)), 0) AS qty
           FROM customer_adjustments
           WHERE status = 'active'
             AND kind IN ('damaged_bottle','lost_bottle')
             AND adjustment_date >= ? AND adjustment_date <= ?
           GROUP BY kind`,
        )
        .all(input.from, input.to) as Array<{ kind: string; qty: number }>

      const startBal = deps.stock.getBalances(input.from)
      // getBalances(asOf) is as-of end of that day; for start use day before
      const endBal = deps.stock.getBalances(input.to)

      const scrapped = scrapRows.reduce((s, r) => s + Number(r.qty), 0)
      const lostAtCustomers = custLoss.reduce((s, r) => s + Number(r.qty), 0)

      return {
        from: input.from,
        to: input.to,
        scrapped,
        lostAtCustomers,
        byReason: scrapRows.map((r) => ({
          reason: r.reason,
          bottleState: r.bottle_state,
          quantity: Number(r.qty),
        })),
        customerLoss: custLoss.map((r) => ({
          kind: r.kind,
          quantity: Number(r.qty),
        })),
        totalOwnedStart: startBal.totals.totalOwned,
        totalOwnedEnd: endBal.totals.totalOwned,
        netChangeOwned: endBal.totals.totalOwned - startBal.totals.totalOwned,
      }
    })
  }

  function tripVarianceReport(input: { from: string; to: string }) {
    return cachedReport('tripVariance', input, () => {
      assertBusinessDate(input.from)
      assertBusinessDate(input.to)
      const list = deps.trips.list({ from: input.from, to: input.to, status: 'closed' })
      const byEmployee = deps.trips.employeeVarianceSummary(input.from, input.to)

      const byMonth = new Map<
        string,
        { period: string; cashVariance: number; bottleVariance: number; trips: number }
      >()
      for (const t of list.items) {
        const period = t.tripDate.slice(0, 7)
        const cur = byMonth.get(period) ?? {
          period,
          cashVariance: 0,
          bottleVariance: 0,
          trips: 0,
        }
        cur.cashVariance += t.cashVariance
        cur.bottleVariance += t.bottleVariance
        cur.trips += 1
        byMonth.set(period, cur)
      }

      return {
        from: input.from,
        to: input.to,
        trips: list.items.map((t) => ({
          tripId: t.id,
          tripDate: t.tripDate,
          employeeId: t.employeeId,
          employeeName: t.employeeName,
          cashVariance: t.cashVariance,
          bottleVariance: t.bottleVariance,
        })),
        byEmployee: byEmployee.items,
        byMonth: [...byMonth.values()].sort((a, b) => (a.period < b.period ? -1 : 1)),
        totals: {
          cashVariance: list.items.reduce((s, t) => s + t.cashVariance, 0),
          bottleVariance: list.items.reduce((s, t) => s + t.bottleVariance, 0),
          trips: list.items.length,
        },
      }
    })
  }

  function stockMovementRegister(input: {
    from: string
    to: string
    productId?: number
    reason?: string
  }) {
    return cachedReport('stockMovementRegister', input, () => {
      return deps.stock.listMovements({
        from: input.from,
        to: input.to,
        productId: input.productId,
        reason: input.reason as
          | 'purchase'
          | 'production'
          | 'load_to_van'
          | 'unload_from_van'
          | 'delivery'
          | 'empty_pickup'
          | 'damaged'
          | 'lost'
          | 'scrapped'
          | 'adjustment'
          | 'opening_stock'
          | undefined,
        limit: 10_000,
      })
    })
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  function dashboard(asOf: string = todayBusinessDate()): DashboardSnapshot {
    return cachedReport('dashboard', { asOf }, () => {
      assertBusinessDate(asOf)
      const period = asOf.slice(0, 7)
      const monthRange = { from: periodStart(period), to: asOf }
      const prevPeriod = previousPeriod(period)
      // Same point last month: clamp day
      const prevDay = Math.min(
        Number(asOf.slice(8, 10)),
        Number(periodEnd(prevPeriod).slice(8, 10)),
      )
      const prevAsOf = `${prevPeriod}-${String(prevDay).padStart(2, '0')}`
      const prevMonthRange = { from: periodStart(prevPeriod), to: prevAsOf }

      const todayRow = raw
        .prepare(
          `SELECT coalesce(sum(quantity), 0) AS bottles,
                  count(distinct customer_id) AS customers,
                  coalesce(sum(cash_collected), 0) AS cash
           FROM deliveries
           WHERE status = 'recorded' AND delivery_date = ?`,
        )
        .get(asOf) as { bottles: number; customers: number; cash: number }

      // Scheduled customers with no entry today (simple: active with weekday schedule matching today)
      const missedScheduled = Number(
        (
          raw
            .prepare(
              `SELECT count(*) AS n FROM customers c
               JOIN customer_schedules s ON s.customer_id = c.id
               WHERE c.deleted_at IS NULL AND c.status = 'active'
                 AND c.customer_type != 'walk_in'
                 AND s.mode = 'weekdays'
                 AND NOT EXISTS (
                   SELECT 1 FROM deliveries d
                   WHERE d.customer_id = c.id AND d.delivery_date = ? AND d.status = 'recorded'
                 )`,
            )
            .get(asOf) as { n: number }
        ).n,
      )

      const bottles = bottlesDelivered(monthRange)
      const revA = revenueAccrual(monthRange)
      const revC = revenueCash(monthRange)
      const exp = expensesTotal(monthRange)
      const profitA = revA - exp
      const profitC = revC - exp

      const prevBottles = bottlesDelivered(prevMonthRange)
      const prevRevA = revenueAccrual(prevMonthRange)
      const prevExp = expensesTotal(prevMonthRange)
      const prevProfitA = prevRevA - prevExp

      const recv = deps.receivables.report(asOf)
      const stockBal = deps.stock.getBalances(asOf)
      // Same total as bottles-out report (excludes walk-in); do not use raw sum of balances.
      const bottlesWithCustomers = deps.stock.listBottlesOut({ minBottles: 1 }).summary
        .totalBottlesWithCustomers

      // Last 12 months chart
      const last12: DashboardSnapshot['charts']['last12Months'] = []
      let p = period
      for (let i = 0; i < 12; i++) {
        const r = { from: periodStart(p), to: periodEnd(p) }
        const ra = revenueAccrual(r)
        const rc = revenueCash(r)
        const e = expensesTotal(r)
        last12.unshift({
          period: p,
          revenueAccrual: ra,
          revenueCash: rc,
          expenses: e,
          profitAccrual: ra - e,
          profitCash: rc - e,
        })
        p = previousPeriod(p)
      }

      const dailyRows = raw
        .prepare(
          `SELECT delivery_date AS date, coalesce(sum(quantity), 0) AS bottles
           FROM deliveries
           WHERE status = 'recorded'
             AND delivery_date >= ? AND delivery_date <= ?
           GROUP BY delivery_date
           ORDER BY delivery_date`,
        )
        .all(periodStart(period), asOf) as Array<{ date: string; bottles: number }>

      const topOverdue = recv.outstanding
        .filter((r) => r.daysOverdue > 0)
        .slice(0, 5)
        .map((r) => ({
          customerId: r.customerId,
          code: r.code,
          name: r.name,
          balance: r.balance,
          daysOverdue: r.daysOverdue,
        }))

      const noDelivery = db
        .select({
          customerId: customers.id,
          code: customers.code,
          name: customers.name,
          lastDeliveryDate: customerBalances.lastDeliveryDate,
        })
        .from(customers)
        .innerJoin(customerBalances, eq(customerBalances.customerId, customers.id))
        .where(
          and(
            isNull(customers.deletedAt),
            eq(customers.status, 'active'),
            ne(customers.customerType, 'walk_in'),
          ),
        )
        .all()
        .map((r) => {
          let daysSince: number | null = null
          if (r.lastDeliveryDate) {
            const a = new Date(`${r.lastDeliveryDate}T00:00:00`)
            const b = new Date(`${asOf}T00:00:00`)
            daysSince = Math.round((b.getTime() - a.getTime()) / 86_400_000)
          }
          return {
            customerId: r.customerId,
            code: r.code,
            name: r.name,
            daysSince,
            lastDeliveryDate: r.lastDeliveryDate,
          }
        })
        .filter((r) => r.daysSince == null || r.daysSince >= 14)
        .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
        .slice(0, 5)

      const recurringItems: DashboardSnapshot['actions']['recurringNotRecorded'] = deps.expenses
        .dueRecurring(asOf)
        .map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          vendorName: r.vendorName,
        }))

      // Week window Mon–Sun containing asOf
      const asOfDate = new Date(`${asOf}T00:00:00`)
      const dow = (asOfDate.getDay() + 6) % 7 // Mon=0
      const weekStart = new Date(asOfDate)
      weekStart.setDate(weekStart.getDate() - dow)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const weekTrips = deps.trips
        .list({ from: fmt(weekStart), to: fmt(weekEnd), status: 'closed' })
        .items.filter((t) => t.cashVariance !== 0 || t.bottleVariance !== 0)
        .slice(0, 5)
        .map((t) => ({
          tripId: t.id,
          tripDate: t.tripDate,
          employeeName: t.employeeName ?? null,
          cashVariance: t.cashVariance,
          bottleVariance: t.bottleVariance,
        }))

      const backupRow = raw
        .prepare(
          `SELECT created_at FROM backup_log WHERE status = 'success' ORDER BY created_at DESC LIMIT 1`,
        )
        .get() as { created_at: string } | undefined
      let backupStale = true
      if (backupRow?.created_at) {
        const ageMs = Date.now() - new Date(backupRow.created_at).getTime()
        backupStale = ageMs > 3 * 86_400_000
      }

      return {
        asOf,
        today: {
          bottlesDelivered: Number(todayRow.bottles),
          customersServed: Number(todayRow.customers),
          cashCollected: Number(todayRow.cash),
          missedScheduled,
        },
        month: {
          period,
          bottlesDelivered: bottles,
          revenueAccrual: revA,
          revenueCash: revC,
          expenses: exp,
          profitAccrual: profitA,
          profitCash: profitC,
          pctChangeBottles: pctChange(bottles, prevBottles),
          pctChangeRevenueAccrual: pctChange(revA, prevRevA),
          pctChangeExpenses: pctChange(exp, prevExp),
          pctChangeProfitAccrual: pctChange(profitA, prevProfitA),
        },
        assets: {
          totalOutstanding: recv.totalOutstanding,
          ageingBuckets: recv.bucketTotals,
          customersInCredit: recv.inCredit.length,
          totalCredit: recv.totalCredit,
          bottlesWithCustomers,
          filledStockAtPlant: stockBal.totals.filledAtPlant,
        },
        charts: {
          last12Months: last12,
          dailyBottlesThisMonth: dailyRows.map((r) => ({
            date: r.date,
            bottles: Number(r.bottles),
          })),
        },
        actions: {
          topOverdue,
          noDeliveryDays: noDelivery,
          recurringNotRecorded: recurringItems,
          tripVariancesThisWeek: weekTrips,
          backupStale,
          backupLastSuccessAt: backupRow?.created_at ?? null,
        },
      }
    })
  }

  /** Operator-safe dashboard: strips profit/expense/salary figures. */
  function dashboardForRole(
    role: 'owner' | 'operator' | 'viewer',
    asOf?: string,
  ): DashboardSnapshot {
    const snap = dashboard(asOf)
    if (role === 'owner') return snap
    return {
      ...snap,
      month: {
        ...snap.month,
        revenueAccrual: 0,
        revenueCash: 0,
        expenses: 0,
        profitAccrual: 0,
        profitCash: 0,
        pctChangeRevenueAccrual: null,
        pctChangeExpenses: null,
        pctChangeProfitAccrual: null,
      },
      charts: {
        last12Months: snap.charts.last12Months.map((m) => ({
          period: m.period,
          revenueAccrual: 0,
          revenueCash: 0,
          expenses: 0,
          profitAccrual: 0,
          profitCash: 0,
        })),
        dailyBottlesThisMonth: snap.charts.dailyBottlesThisMonth,
      },
      actions: {
        ...snap.actions,
        recurringNotRecorded: [],
      },
      // Keep receivables / bottles — operator may see operational money owed
      assets: {
        ...snap.assets,
      },
    }
  }

  return {
    revenueAccrual,
    revenueCash,
    expensesTotal,
    bottlesDelivered,
    walkInSales,
    profitAndLoss,
    expenseDrilldown,
    salesSummary,
    customerWiseSales,
    areaRoutePerformance,
    employeeDeliveryReport,
    customerActivity,
    customerConsumptionTrend,
    receivablesAgeing,
    collectionReport,
    expenseReport,
    costPerBottle,
    bottlesOutReport,
    bottleLossReport,
    tripVarianceReport,
    stockMovementRegister,
    dashboard,
    dashboardForRole,
    // helpers for tests
    accrualInvoiceBreakdown,
    cashCollections,
    monthsBetween,
  }
}

export type ReportService = ReturnType<typeof createReportService>

/** Resolve UI period presets to a concrete date range. */
export function resolveReportRange(input: {
  kind: 'month' | 'quarter' | 'year' | 'custom'
  period?: string
  year?: number
  from?: string
  to?: string
}): DateRange & { label: string } {
  if (input.kind === 'custom') {
    if (!input.from || !input.to) throw new Error('custom range requires from and to')
    assertBusinessDate(input.from)
    assertBusinessDate(input.to)
    return { from: input.from, to: input.to, label: `${input.from} → ${input.to}` }
  }
  if (input.kind === 'month') {
    const period = input.period!
    assertPeriod(period)
    return {
      from: periodStart(period),
      to: periodEnd(period),
      label: period,
    }
  }
  if (input.kind === 'quarter') {
    const period = input.period!
    assertPeriod(period)
    const y = Number(period.slice(0, 4))
    const m = Number(period.slice(5, 7))
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1
    const from = `${y}-${String(qStartMonth).padStart(2, '0')}-01`
    const endMonth = qStartMonth + 2
    const to = periodEnd(`${y}-${String(endMonth).padStart(2, '0')}`)
    return { from, to, label: `${y}-Q${Math.floor((m - 1) / 3) + 1}` }
  }
  // year
  const y = input.year ?? Number(input.period!.slice(0, 4))
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
}
