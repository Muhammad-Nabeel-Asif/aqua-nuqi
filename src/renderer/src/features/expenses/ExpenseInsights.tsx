import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Money } from '@renderer/components/Money'
import type { CategoryTotalDto, MonthTotalDto, VendorTotalDto } from '@shared/contracts'
import { formatMoney, type Paisa } from '@shared/money'

const COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#0369a1', '#075985', '#0c4a6e']

type Props = {
  byMonth: MonthTotalDto[]
  byCategory: CategoryTotalDto[]
  topVendors: VendorTotalDto[]
}

export function ExpenseInsights({ byMonth, byCategory, topVendors }: Props) {
  const monthData = byMonth.map((m) => ({
    period: m.period,
    total: m.total / 100,
    totalPaisa: m.total,
  }))
  const catData = byCategory.slice(0, 8).map((c) => ({
    name: c.categoryName,
    value: c.total / 100,
    totalPaisa: c.total,
    percent: c.percent,
  }))

  return (
    <div className="mt-8 space-y-6 border-t pt-6">
      <h2 className="text-lg font-semibold text-slate-900">Insights</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-700">Last 12 months</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => formatMoney((Number(v) * 100) as Paisa)}
                  labelFormatter={(l) => String(l)}
                />
                <Bar dataKey="total" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-700">By category</h3>
          <div className="flex h-56 gap-4">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" outerRadius={80} label={false}>
                    {catData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney((Number(v) * 100) as Paisa)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-1/2 space-y-1 overflow-auto text-sm">
              {byCategory.slice(0, 8).map((c) => (
                <li key={c.categoryId} className="flex justify-between gap-2">
                  <span className="truncate text-slate-700">{c.categoryName}</span>
                  <span className="shrink-0 tabular-nums text-slate-900">
                    <Money value={c.total} /> ({c.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-700">Top vendors</h3>
        {topVendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vendors in this range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 font-medium">Vendor</th>
                <th className="py-2 text-right font-medium">Count</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {topVendors.map((v) => (
                <tr key={v.vendorName} className="border-b last:border-0">
                  <td className="py-2">{v.vendorName}</td>
                  <td className="py-2 text-right tabular-nums">{v.count}</td>
                  <td className="py-2 text-right tabular-nums">
                    <Money value={v.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
