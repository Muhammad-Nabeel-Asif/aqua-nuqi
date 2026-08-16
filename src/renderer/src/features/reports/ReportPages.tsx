import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { api } from '@renderer/lib/api'
import { paisaToDecimalString } from '@shared/money'
import { isMoneyColumn } from './money-columns'
import {
  ageingAsOf,
  asRows,
  humanHeader,
  reportTableRows,
  visibleReportKeys,
  type ReportRow,
  type ReportTableKey,
} from './report-rows'
import { defaultMonthPeriod, resolveLocalRange, type RangeKind } from './reportRange'
import { ReportShell, type ReportExportRow } from './ReportShell'

export type ReportKey = ReportTableKey
type Row = ReportRow

export function ReportListPage({
  report,
  title,
  subtitle,
}: {
  report: ReportKey
  title: string
  subtitle?: string
}) {
  const [range, setRange] = useState({
    kind: 'month' as RangeKind,
    period: defaultMonthPeriod(),
    year: String(new Date().getFullYear()),
    from: '',
    to: '',
  })
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual')
  const resolved = resolveLocalRange(range.kind, {
    period: range.period,
    year: Number(range.year),
    from: range.from,
    to: range.to,
  })
  const q = useQuery({
    queryKey: ['report', report, resolved.from, resolved.to, basis],
    queryFn: () => fetchReport(report, resolved.from, resolved.to, basis),
  })
  const data = (q.data ?? {}) as Row
  const source = reportTableRows(report, data)
  const tableKeys = visibleReportKeys(source)
  const rows: ReportExportRow[] = source.map((row) =>
    Object.fromEntries(
      tableKeys.map((key) => [
        key,
        typeof row[key] === 'number' && isMoneyColumn(key)
          ? paisaToDecimalString(row[key] as number)
          : String(row[key] ?? ''),
      ]),
    ),
  )
  const columns = tableKeys.map((key) => ({
    key,
    header: humanHeader(key),
  }))
  const exportData = async (kind: 'pdf' | 'excel') => {
    try {
      const input = {
        title,
        fileName: `${report}-${resolved.from}-${resolved.to}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`,
        openAfter: true,
        filters: [
          { label: 'From', value: resolved.from },
          { label: 'To', value: resolved.to },
        ],
        columns,
        rows,
      }
      if (kind === 'pdf') await api.pdf.exportTable(input)
      else await api.pdf.exportExcel(input)
      toast({ title: `${kind.toUpperCase()} exported`, variant: 'success' })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'error',
      })
    }
  }
  const chartData = source.slice(0, 24).map((row) => ({
    name: String(row.bucket ?? row.period ?? row.date ?? ''),
    value: Number(row.value ?? row.revenue ?? row.total ?? row.bottles ?? 0) / 100,
  }))
  const isProfitLoss = report === 'profitAndLoss'
  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      range={range}
      setRange={setRange}
      filters={[`From: ${resolved.from}`, `To: ${resolved.to}`]}
      onExportPdf={() => void exportData('pdf')}
      onExportExcel={() => void exportData('excel')}
      columns={columns}
      rows={rows}
      extraFilters={
        isProfitLoss ? (
          <select
            className="h-9 rounded-md border bg-white px-2 text-sm"
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
          >
            <option value="accrual">What we billed</option>
            <option value="cash">What we collected</option>
          </select>
        ) : undefined
      }
    >
      {isProfitLoss ? (
        <ProfitLossSummary data={data} />
      ) : (
        <Summary data={data} loading={q.isLoading} />
      )}
      {chartData.length > 1 && (
        <div className="my-4 h-64 rounded-lg border bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#0284c7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable rows={source} keys={tableKeys} />
    </ReportShell>
  )
}

async function fetchReport(
  report: ReportKey,
  from: string,
  to: string,
  basis: 'accrual' | 'cash',
): Promise<unknown> {
  switch (report) {
    case 'profitAndLoss':
      return api.reports.profitAndLoss({ from, to, basis, compare: true })
    case 'salesSummary':
      return api.reports.salesSummary({ from, to, groupBy: 'day' })
    case 'customerWiseSales':
      return api.reports.customerWiseSales({ from, to })
    case 'areaRoutePerformance':
      return api.reports.areaRoutePerformance({ from, to, groupBy: 'area' })
    case 'employeeDelivery':
      return api.reports.employeeDelivery(from, to)
    case 'customerActivity':
      return api.reports.customerActivity(from, to)
    case 'collection':
      return api.reports.collection(from, to)
    case 'expenses':
      return api.reports.expenses(from, to)
    case 'costPerBottle':
      return api.reports.costPerBottle(from, to)
    case 'bottleLoss':
      return api.reports.bottleLoss(from, to)
    case 'tripVariance':
      return api.reports.tripVariance(from, to)
    case 'stockMovements':
      return api.reports.stockMovements({ from, to })
    case 'receivablesAgeing':
      return api.reports.receivablesAgeing(ageingAsOf(to))
  }
}

function Summary({ data, loading }: { data: Row; loading: boolean }) {
  const entries = Object.entries(data).filter(
    ([key, value]) =>
      typeof value === 'number' &&
      (isMoneyColumn(key) ||
        key.includes('Count') ||
        key === 'count' ||
        key === 'units' ||
        key === 'bottles' ||
        key === 'scrapped' ||
        key === 'lostAtCustomers'),
  )
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key} className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">{humanHeader(key)}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {isMoneyColumn(key) ? <Money value={Number(value)} /> : String(value)}
          </p>
        </div>
      ))}
      {loading && !entries.length ? (
        <p className="text-sm text-muted-foreground">Loading this report…</p>
      ) : null}
    </div>
  )
}

function ProfitLossSummary({ data }: { data: Row }) {
  const revenue = (data.revenue ?? {}) as Row
  const excluded = (data.excluded ?? {}) as Row
  const expenses = asRows(data.expenses)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net revenue" value={revenue.netRevenue} />
        <Metric label="Expenses" value={data.totalExpenses} />
        <Metric label="Net profit" value={data.netProfit} />
        <Metric label="Margin" value={data.marginPercent} suffix="%" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 font-semibold">Revenue breakdown</h2>
          {Object.entries(revenue).map(([k, v]) => (
            <p className="flex justify-between border-b py-2 text-sm last:border-0" key={k}>
              <span>{humanHeader(k)}</span>
              <Money value={Number(v)} />
            </p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Excluded deposits: <Money value={Number(excluded.depositsReceived ?? 0)} />
            {Number(excluded.employeeAdvances ?? 0) > 0 ? (
              <>
                {' '}
                · Salary advances (not a cost):{' '}
                <Money value={Number(excluded.employeeAdvances ?? 0)} />
              </>
            ) : null}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 font-semibold">Expenses by category</h2>
          {expenses.map((e) => (
            <p
              className="flex justify-between border-b py-2 text-sm last:border-0"
              key={String(e.categoryId)}
            >
              <span>{String(e.categoryName)}</span>
              <Money value={Number(e.total)} />
            </p>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{String(data.basisExplanation ?? '')}</p>
    </div>
  )
}
function Metric({ label, value, suffix }: { label: string; value: unknown; suffix?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {suffix ? `${String(value ?? '—')}${suffix}` : <Money value={Number(value ?? 0)} />}
      </p>
    </div>
  )
}
function ReportTable({ rows, keys }: { rows: Row[]; keys: string[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {keys.map((key) => (
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium" key={key}>
                {humanHeader(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr className="border-t" key={i}>
              {keys.map((key) => (
                <td className="whitespace-nowrap px-3 py-2" key={key}>
                  {typeof row[key] === 'number' && isMoneyColumn(key) ? (
                    <Money value={Number(row[key])} />
                  ) : (
                    String(row[key] ?? '—')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-8 text-center text-sm text-muted-foreground">No data for this period.</p>
      )}
    </div>
  )
}
