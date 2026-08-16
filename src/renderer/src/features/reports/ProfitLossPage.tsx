import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Money } from '@renderer/components/Money'
import { toast } from '@renderer/components/Toast'
import { api } from '@renderer/lib/api'
import { paisaToDecimalString } from '@shared/money'
import { defaultMonthPeriod, resolveLocalRange, type RangeKind } from './reportRange'
import { ReportShell } from './ReportShell'

export function ProfitLossPage() {
  const [range, setRange] = useState({
    kind: 'month' as RangeKind,
    period: defaultMonthPeriod(),
    year: String(new Date().getFullYear()),
    from: '',
    to: '',
  })
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual')
  const [drillCategoryId, setDrillCategoryId] = useState<number | null>(null)
  const resolved = resolveLocalRange(range.kind, {
    period: range.period,
    year: Number(range.year),
    from: range.from,
    to: range.to,
  })

  const pl = useQuery({
    queryKey: ['reports', 'profitAndLoss', resolved.from, resolved.to, basis],
    queryFn: () =>
      api.reports.profitAndLoss({
        from: resolved.from,
        to: resolved.to,
        basis,
        compare: true,
      }),
  })

  const drill = useQuery({
    queryKey: ['reports', 'expenseDrilldown', resolved.from, resolved.to, drillCategoryId],
    queryFn: () => api.reports.expenseDrilldown(resolved.from, resolved.to, drillCategoryId!),
    enabled: drillCategoryId != null,
  })

  const data = pl.data

  const exportRows =
    data?.expenses.map((e) => ({
      category: e.categoryName,
      total: paisaToDecimalString(e.total),
      count: String(e.count),
    })) ?? []

  const exportData = async (kind: 'pdf' | 'excel') => {
    if (!data) return
    try {
      const columns = [
        { key: 'category', header: 'Category' },
        { key: 'total', header: 'Total (Rs)' },
        { key: 'count', header: 'Lines' },
      ]
      const filters = [
        { label: 'From', value: resolved.from },
        { label: 'To', value: resolved.to },
        { label: 'Basis', value: basis === 'accrual' ? 'What we billed' : 'What we collected' },
        {
          label: 'Net revenue',
          value: paisaToDecimalString(data.revenue.netRevenue),
        },
        {
          label: 'Net profit',
          value: paisaToDecimalString(data.netProfit),
        },
      ]
      const title = `Profit (income minus costs) (${basis === 'accrual' ? 'billed' : 'collected'})`
      const fileName = `profit-loss-${basis}-${resolved.from}-${resolved.to}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`
      if (kind === 'pdf') {
        await api.pdf.exportTable({
          title,
          fileName,
          openAfter: true,
          filters,
          columns,
          rows: exportRows,
        })
      } else {
        await api.pdf.exportExcel({
          title,
          fileName,
          openAfter: true,
          filters,
          columns,
          rows: exportRows,
        })
      }
      toast({ title: `${kind.toUpperCase()} exported`, variant: 'success' })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'error',
      })
    }
  }

  return (
    <ReportShell
      title="Profit (income minus costs)"
      subtitle="The headline report — billed vs received, with deposits kept out of income"
      range={range}
      setRange={setRange}
      filters={[
        `From: ${resolved.from}`,
        `To: ${resolved.to}`,
        `View: ${basis === 'accrual' ? 'What we billed' : 'What we collected'}`,
      ]}
      onExportPdf={() => void exportData('pdf')}
      onExportExcel={() => void exportData('excel')}
      columns={[
        { key: 'category', header: 'Category' },
        { key: 'total', header: 'Total' },
        { key: 'count', header: 'Lines' },
      ]}
      rows={exportRows}
      extraFilters={
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-white px-2 text-sm"
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
          >
            <option value="accrual">What we billed</option>
            <option value="cash">What we collected</option>
          </select>
        </div>
      }
    >
      {data && (
        <div className="space-y-4">
          <p className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            {data.basisExplanation}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Net revenue" value={data.revenue.netRevenue} />
            <Metric label="Total expenses" value={data.totalExpenses} />
            <Metric label="Net profit" value={data.netProfit} />
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {data.marginPercent == null ? '—' : `${data.marginPercent}%`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Revenue</h2>
              <Row label="Water sales" value={data.revenue.waterSales} />
              <Row label="Other charges" value={data.revenue.otherCharges} />
              <Row
                label="Less: discounts & write-offs"
                value={-data.revenue.discountsAndWriteOffs}
              />
              <Row label="Counter sales (included)" value={data.revenue.walkInSales} muted />
              <Row label="Net revenue" value={data.revenue.netRevenue} bold />
              <div className="mt-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-950">
                <p className="font-medium">Excluded from revenue (liability / not earned)</p>
                <p>
                  Deposits received: <Money value={data.excluded.depositsReceived} />
                </p>
                <p>
                  Deposits refunded: <Money value={data.excluded.depositsRefunded} />
                </p>
                <p>
                  Deposit-tagged payments: <Money value={data.excluded.depositPaymentsTagged} />
                </p>
                <p>
                  Customer credit balances: <Money value={data.excluded.customerCreditBalances} />
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Expenses (largest first)</h2>
              {data.expenses.map((e) => (
                <button
                  type="button"
                  key={e.categoryId}
                  className="flex w-full items-center justify-between border-b py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                  onClick={() => setDrillCategoryId(e.categoryId)}
                >
                  <span>
                    {e.categoryName}
                    {e.isSalaries ? (
                      <span className="ml-2 text-xs text-muted-foreground">(payroll)</span>
                    ) : null}
                  </span>
                  <Money value={e.total} />
                </button>
              ))}
              <Row label="Total expenses" value={data.totalExpenses} bold />
              <div className="mt-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-950">
                <p className="font-medium">Excluded from cost (not an operating expense)</p>
                <p>
                  Salary advances: <Money value={data.excluded.employeeAdvances ?? 0} />
                </p>
                <p className="mt-1 text-amber-900">
                  Advances are money already given to staff. They settle when you run monthly
                  salaries — they do not reduce this month&apos;s profit on their own.
                </p>
              </div>
            </div>
          </div>

          {(data.previousPeriod || data.samePeriodLastYear) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.previousPeriod && (
                <CompareCard title="Previous period" row={data.previousPeriod} />
              )}
              {data.samePeriodLastYear && (
                <CompareCard title="Same period last year" row={data.samePeriodLastYear} />
              )}
            </div>
          )}

          {drillCategoryId != null && (
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Category drill-down</h2>
                <button
                  type="button"
                  className="text-sm text-sky-700 underline"
                  onClick={() => setDrillCategoryId(null)}
                >
                  Close
                </button>
              </div>
              <ul className="space-y-1 text-sm">
                {(drill.data?.items ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between border-b py-1">
                    <span>
                      {item.expenseDate} · {item.description ?? item.vendorName ?? item.source}
                    </span>
                    <Money value={item.amount} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        <Money value={value} />
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string
  value: number
  bold?: boolean
  muted?: boolean
}) {
  return (
    <p
      className={`flex justify-between border-b py-2 text-sm last:border-0 ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''}`}
    >
      <span>{label}</span>
      <Money value={value} />
    </p>
  )
}

function CompareCard({
  title,
  row,
}: {
  title: string
  row: { from: string; to: string; netRevenue: number; totalExpenses: number; netProfit: number }
}) {
  return (
    <div className="rounded-lg border bg-white p-4 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">
        {row.from} → {row.to}
      </p>
      <Row label="Net revenue" value={row.netRevenue} />
      <Row label="Expenses" value={row.totalExpenses} />
      <Row label="Net profit" value={row.netProfit} bold />
    </div>
  )
}
