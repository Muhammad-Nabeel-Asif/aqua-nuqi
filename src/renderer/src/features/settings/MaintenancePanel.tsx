import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function MaintenancePanel() {
  const qc = useQueryClient()
  const statsQuery = useQuery({
    queryKey: ['maintenance', 'stats'],
    queryFn: () => api.maintenance.stats(),
  })
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.integrity.check>> | null>(null)
  const [busy, setBusy] = useState(false)

  async function runCheck() {
    setBusy(true)
    try {
      const r = await api.integrity.check()
      setReport(r)
      toast({
        title: r.issues.length === 0 ? 'Data looks fine' : `${r.issues.length} issue(s) found`,
        variant: r.issues.some((i) => i.severity === 'error') ? 'error' : 'success',
      })
    } catch (err) {
      toast({
        title: 'Check failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function compact() {
    setBusy(true)
    try {
      const r = await api.maintenance.compact()
      toast({
        title: 'Database compacted',
        description: `${formatBytes(r.beforeBytes)} → ${formatBytes(r.afterBytes)}`,
        variant: 'success',
      })
      await qc.invalidateQueries({ queryKey: ['maintenance'] })
    } catch (err) {
      toast({
        title: 'Could not shrink unused space',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    setBusy(true)
    try {
      const r = await api.maintenance.rebuildSummaries()
      toast({ title: `Rebuilt ${r.updated} customer balances`, variant: 'success' })
      await qc.invalidateQueries({ queryKey: ['maintenance'] })
      if (report) await runCheck()
    } catch (err) {
      toast({
        title: 'Rebuild failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const stats = statsQuery.data

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Run a data check after unusual crashes or if numbers look wrong. Safe fixes recalculate
        summary tables from the ledger.
      </p>
      <div className="grid gap-3 rounded border p-3 text-sm md:grid-cols-3">
        <div>
          <div className="text-slate-500">Database size</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatBytes(stats?.dbSizeBytes ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Oldest transaction</div>
          <div className="font-medium">{stats?.oldestTransactionDate ?? '—'}</div>
        </div>
        <div>
          <div className="text-slate-500">Newest transaction</div>
          <div className="font-medium">{stats?.newestTransactionDate ?? '—'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void runCheck()} disabled={busy}>
          Run data check
        </Button>
        <Button variant="outline" onClick={() => void rebuild()} disabled={busy}>
          Rebuild summaries
        </Button>
        <Button variant="outline" onClick={() => void compact()} disabled={busy}>
          Shrink unused space
        </Button>
      </div>

      {report ? (
        <div className="space-y-2">
          <h3 className="font-semibold">
            Report · pragma {report.pragmaOk ? 'OK' : 'FAILED'} · {report.issues.length} issue(s)
          </h3>
          {report.issues.length === 0 ? (
            <p className="text-sm text-emerald-700">No issues found.</p>
          ) : (
            <ul className="space-y-2">
              {report.issues.map((issue) => (
                <li key={issue.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">
                    [{issue.severity}] {issue.message}
                  </div>
                  {issue.details ? (
                    <p className="mt-1 text-slate-600 whitespace-pre-wrap">{issue.details}</p>
                  ) : null}
                  {issue.fixable && issue.fixAction === 'recalculate_balances' ? (
                    <Button
                      className="mt-2"
                      size="sm"
                      onClick={async () => {
                        try {
                          const r = await api.integrity.fix('recalculate_balances')
                          toast({ title: r.message, variant: 'success' })
                          await runCheck()
                        } catch (err) {
                          toast({
                            title: 'Fix failed',
                            description: err instanceof AppError ? err.message : 'Error',
                            variant: 'error',
                          })
                        }
                      }}
                    >
                      Fix: recalculate balances
                    </Button>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      No automatic fix — investigate manually or restore a backup.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Row counts</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
              {JSON.stringify(report.tableCounts, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  )
}
