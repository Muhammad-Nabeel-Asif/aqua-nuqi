import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { api } from '@renderer/lib/api'
import { paisaToDecimalString } from '@shared/money'
import { defaultMonthPeriod, resolveLocalRange, type RangeKind } from './reportRange'
import { ReportShell, type ReportExportRow } from './ReportShell'

export type ReportKey =
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
type Row = Record<string, unknown>
const asRows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => typeof v === 'object' && v !== null) : []
const moneyKeys = new Set([
  'value',
  'revenue',
  'total',
  'amount',
  'expenses',
  'netProfit',
  'cashCollected',
  'paymentsTotal',
  'costPerBottle',
  'averageRevenuePerBottle',
  'marginPerBottle',
])

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
  const source = asRows(data.items ?? data.byCategory ?? data.outstanding ?? data.trips)
  const rows: ReportExportRow[] = source.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'number' && moneyKeys.has(key)
          ? paisaToDecimalString(value)
          : String(value ?? ''),
      ]),
    ),
  )
  const columns = Object.keys(rows[0] ?? {}).map((key) => ({
    key,
    header: key.replace(/[A-Z]/g, (m) => ` ${m}`).replace(/^./, (m) => m.toUpperCase()),
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
      else
        await api.pdf.exportExcel({
          title,
          fileName: input.fileName,
          openAfter: true,
          columns,
          rows,
        })
      toast({ title: `${kind.toUpperCase()} exported`, variant: 'success' })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'error',
      })
    }
  }
  const chartData = source
    .slice(0, 24)
    .map((row) => ({
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
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
        ) : undefined
      }
    >
      {isProfitLoss ? <ProfitLossSummary data={data} /> : <Summary data={data} report={report} />}
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
      <ReportTable rows={source} />
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
      return api.reports.receivablesAgeing(to)
  }
}

function Summary({ data, report }: { data: Row; report: ReportKey }) {
  const entries = Object.entries(data).filter(
    ([key, value]) =>
      typeof value === 'number' &&
      (moneyKeys.has(key) || key.includes('Count') || key === 'units' || key === 'bottles'),
  )
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key} className="rounded-lg border bg-white p-4">
          <p className="text-xs capitalize text-muted-foreground">
            {key.replace(/[A-Z]/g, (m) => ` ${m}`)}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {moneyKeys.has(key) ? <Money value={Number(value)} /> : String(value)}
          </p>
        </div>
      ))}
      {!entries.length && <p className="text-sm text-muted-foreground">Loading {report} report…</p>}
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
              <span>{k}</span>
              <Money value={Number(v)} />
            </p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Excluded deposits: <Money value={Number(excluded.depositsReceived ?? 0)} />
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
function ReportTable({ rows }: { rows: Row[] }) {
  const keys = Object.keys(rows[0] ?? {})
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {keys.map((key) => (
              <th
                className="whitespace-nowrap px-3 py-2 text-left font-medium capitalize"
                key={key}
              >
                {key.replace(/[A-Z]/g, (m) => ` ${m}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr className="border-t" key={i}>
              {keys.map((key) => (
                <td className="whitespace-nowrap px-3 py-2" key={key}>
                  {typeof row[key] === 'number' && moneyKeys.has(key) ? (
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
