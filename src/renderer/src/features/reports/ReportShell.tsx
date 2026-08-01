import type { ReactNode } from 'react'
import { useState } from 'react'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { resolveLocalRange, type RangeKind } from './reportRange'

export type ReportExportRow = Record<string, string | number>
type Props = {
  title: string
  subtitle?: string
  children: ReactNode
  extraFilters?: ReactNode
  filters?: string[]
  columns?: { key: string; header: string; align?: 'left' | 'right' }[]
  rows?: ReportExportRow[]
  onExportPdf?: () => void
  onExportExcel?: () => void
  range: { kind: RangeKind; period: string; year: string; from: string; to: string }
  setRange: (range: Props['range']) => void
}

export function ReportShell({
  title,
  subtitle,
  children,
  extraFilters,
  filters = [],
  columns,
  rows,
  onExportPdf,
  onExportExcel,
  range,
  setRange,
}: Props) {
  const [applied, setApplied] = useState(range)
  const resolved = resolveLocalRange(applied.kind, {
    period: applied.period,
    year: Number(applied.year),
    from: applied.from,
    to: applied.to,
  })
  const apply = () => setRange(applied)
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            {onExportPdf && (
              <Button variant="outline" onClick={onExportPdf}>
                PDF
              </Button>
            )}
            {onExportExcel && (
              <Button variant="outline" onClick={onExportExcel}>
                Excel
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-3">
        <label className="text-xs text-slate-600">
          Period
          <select
            className="mt-1 block h-9 rounded-md border bg-white px-2 text-sm"
            value={applied.kind}
            onChange={(e) => setApplied({ ...applied, kind: e.target.value as RangeKind })}
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {applied.kind === 'custom' ? (
          <>
            <Input
              type="date"
              value={applied.from}
              onChange={(e) => setApplied({ ...applied, from: e.target.value })}
            />
            <Input
              type="date"
              value={applied.to}
              onChange={(e) => setApplied({ ...applied, to: e.target.value })}
            />
          </>
        ) : applied.kind === 'year' ? (
          <Input
            className="w-24"
            type="number"
            value={applied.year}
            onChange={(e) => setApplied({ ...applied, year: e.target.value })}
          />
        ) : (
          <Input
            className="w-36"
            type="month"
            value={applied.period}
            onChange={(e) => setApplied({ ...applied, period: e.target.value })}
          />
        )}
        {extraFilters}
        <Button onClick={apply}>Apply</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900">{resolved.label}</span>
        {filters.map((filter) => (
          <span key={filter} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            {filter}
          </span>
        ))}
      </div>
      {children}
      {columns && rows && (
        <span
          className="hidden"
          data-export-columns={columns.length}
          data-export-rows={rows.length}
        />
      )}
    </div>
  )
}
