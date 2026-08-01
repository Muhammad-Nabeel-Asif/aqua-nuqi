import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { ProgressDialog } from '@renderer/components/ProgressDialog'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import type { InvoicePreviewDto } from '@shared/contracts'
import { currentPeriod, previousPeriod } from '@shared/date'
import { AppError } from '@shared/errors'
import { useBatchPdfExport } from './useBatchPdfExport'

export function GenerateBillsPage() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(previousPeriod(currentPeriod()))
  const [mode, setMode] = useState<'all' | 'area' | 'route'>('all')
  const [areaId, setAreaId] = useState<number | ''>('')
  const [routeId, setRouteId] = useState<number | ''>('')
  const [includeZero, setIncludeZero] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<{
    generated: number
    skipped: Array<{ code: string; name: string; reason: string }>
    invoiceIds: number[]
    elapsedMs: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const batchPdf = useBatchPdfExport()

  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.areas.list() })
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })
  const preview = useQuery({
    queryKey: ['invoice-preview-batch', period, mode, areaId, routeId, includeZero],
    queryFn: () =>
      api.invoices.previewBatch({
        period,
        filter: {
          mode,
          areaId: mode === 'area' && areaId !== '' ? areaId : undefined,
          routeId: mode === 'route' && routeId !== '' ? routeId : undefined,
        },
        includeZeroActivity: includeZero,
      }),
  })

  const rows = useMemo(() => preview.data?.items ?? [], [preview.data?.items])
  const generatable = useMemo(
    () => rows.filter((r) => !r.skipReason || r.existingStatus === 'draft'),
    [rows],
  )

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(generatable.map((r) => r.customerId)) : new Set())
  }

  async function generate(forceClosedPeriod = false) {
    const ids = selected.size ? [...selected] : generatable.map((r) => r.customerId)
    if (!ids.length) {
      toast({ title: 'Nothing to generate', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await api.invoices.generateBatch({
        period,
        filter: { mode: 'selected', customerIds: ids },
        includeZeroActivity: includeZero,
        forceClosedPeriod,
      })
      setResult(res)
      setSelected(new Set())
      await qc.invalidateQueries({ queryKey: ['invoice-preview-batch'] })
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      toast({ title: `${res.generated} invoices generated`, variant: 'success' })
    } catch (e) {
      if (e instanceof AppError && e.code === 'PERIOD_LOCKED' && !forceClosedPeriod) {
        setBusy(false)
        if (window.confirm(`${e.message}\n\nGenerate bills for this closed period anyway?`)) {
          await generate(true)
        }
        return
      }
      toast({
        title: 'Batch failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Generate bills"
        subtitle="Preview and create monthly invoices"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/billing/invoices">Invoice list</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/billing/periods">Close periods</Link>
            </Button>
          </>
        }
      />
      <ProgressDialog
        open={batchPdf.progress.open}
        title="Exporting invoice PDFs"
        current={batchPdf.progress.current}
        total={batchPdf.progress.total}
        message={batchPdf.progress.message}
        cancelling={batchPdf.progress.cancelling}
        onCancel={() => batchPdf.cancel()}
      />

      <div className="mb-4 grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-4">
        <div>
          <Label>Period</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div>
          <Label>Filter</Label>
          <select
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="all">All active customers</option>
            <option value="area">By area</option>
            <option value="route">By route</option>
          </select>
        </div>
        {mode === 'area' && (
          <div>
            <Label>Area</Label>
            <select
              className="flex h-10 w-full rounded-md border px-3 text-sm"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {areas.data?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {mode === 'route' && (
          <div>
            <Label>Route</Label>
            <select
              className="flex h-10 w-full rounded-md border px-3 text-sm"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {routes.data?.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
          />
          Include zero-activity
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
          Select all
        </Button>
        <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
          Clear
        </Button>
        <Button disabled={busy} onClick={() => void generate()}>
          Generate selected
        </Button>
        <Button
          disabled={!result?.invoiceIds.length}
          variant="outline"
          onClick={() =>
            void batchPdf.run({
              period,
              invoiceIds: result?.invoiceIds,
            })
          }
        >
          Export PDFs
        </Button>
        {result && (
          <Button
            variant="outline"
            onClick={() =>
              void (async () => {
                const r = await api.invoices.issueAll(result.invoiceIds)
                toast({
                  title: `Issued ${r.issued}`,
                  description: r.errors[0],
                  variant: r.errors.length ? 'error' : 'success',
                })
                await qc.invalidateQueries({ queryKey: ['invoices'] })
              })()
            }
          >
            Issue all generated
          </Button>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        Close the period after billing so the numbers can&apos;t change.{' '}
        <Button
          size="sm"
          variant="outline"
          className="ml-2"
          onClick={() =>
            void (async () => {
              try {
                await api.period.close(period)
                toast({ title: `Period ${period} closed`, variant: 'success' })
              } catch (e) {
                toast({
                  title: 'Close failed',
                  description: e instanceof Error ? e.message : 'Error',
                  variant: 'error',
                })
              }
            })()
          }
        >
          Close {period}
        </Button>
      </div>

      {result && (
        <div className="mb-4 rounded-lg border bg-white p-4 text-sm">
          Generated {result.generated} in {result.elapsedMs} ms. Skipped {result.skipped.length}.
          {result.skipped.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-auto text-xs text-muted-foreground">
              {result.skipped.map((s) => (
                <li key={`${s.code}-${s.reason}`}>
                  {s.code} {s.name}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left">
            <tr>
              <th className="p-2" />
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Deliveries</th>
              <th className="p-2 text-right">Units</th>
              <th className="p-2 text-right">This period</th>
              <th className="p-2 text-right">Previous</th>
              <th className="p-2 text-right">Payable</th>
              <th className="p-2">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: InvoicePreviewDto) => {
              const disabled = Boolean(r.skipReason && r.existingStatus !== 'draft')
              return (
                <tr key={r.customerId} className="border-t">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.has(r.customerId)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(r.customerId)
                        else next.delete(r.customerId)
                        setSelected(next)
                      }}
                    />
                  </td>
                  <td className="p-2">
                    {r.customerCode} — {r.customerName}
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.deliveriesCount}</td>
                  <td className="p-2 text-right tabular-nums">{r.deliveriesQty}</td>
                  <td className="p-2 text-right">
                    <Money value={r.invoiceTotal} />
                  </td>
                  <td className="p-2 text-right">
                    <Money value={r.openingBalance} />
                  </td>
                  <td className="p-2 text-right">
                    <Money value={r.totalPayable} />
                  </td>
                  <td className="p-2 text-xs text-amber-700">
                    {r.skipReason ?? r.warnings.join(', ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-6 text-sm text-muted-foreground">No customers match this filter.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Period <DateText value={`${period}-01`} /> preview — {rows.length} rows
      </p>
    </div>
  )
}
