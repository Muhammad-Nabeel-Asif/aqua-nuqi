import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'
import { formatMoney, type Paisa } from '@shared/money'

type AdvanceStatus = 'outstanding' | 'settled' | 'waived' | 'void' | 'all'

export function AdvancesPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<AdvanceStatus>('outstanding')
  const listQ = useQuery({
    queryKey: ['advances', 'global', status],
    queryFn: () => api.advances.list({ status }),
  })

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['advances'] })
  }

  async function waive(id: number) {
    const reason = window.prompt('Reason for waiving this advance:')
    if (!reason?.trim()) return
    try {
      await api.advances.waive(id, reason.trim())
      toast({ title: 'Advance waived', variant: 'success' })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not waive advance',
        variant: 'error',
      })
    }
  }

  async function voidAdvance(id: number) {
    const reason = window.prompt('Reason for voiding this advance:')
    if (!reason?.trim()) return
    try {
      await api.advances.void(id, reason.trim())
      toast({ title: 'Advance voided', variant: 'success' })
      await refresh()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Could not void advance',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Salary advances"
        subtitle={`Outstanding total: ${formatMoney((listQ.data?.outstandingTotal ?? 0) as Paisa)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/employees">Employees</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/payroll">Payroll</Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(['outstanding', 'settled', 'waived', 'void', 'all'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sky-50 text-xs text-slate-600">
            <tr>
              {['Date', 'Employee', 'Amount', 'Settled', 'Outstanding', 'Reason', 'Status', ''].map(
                (h) => (
                  <th key={h} className="px-3 py-3 font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr>
                <td className="p-6" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : (listQ.data?.items ?? []).length === 0 ? (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={8}>
                  No advances for this filter.
                </td>
              </tr>
            ) : (
              (listQ.data?.items ?? []).map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">
                    <DateText value={a.advanceDate} />
                  </td>
                  <td className="px-3 py-2">
                    <Link className="text-sky-800" to={`/employees/${a.employeeId}`}>
                      {a.employeeCode} · {a.employeeName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Money value={a.amount} />
                  </td>
                  <td className="px-3 py-2">
                    <Money value={a.settledAmount} />
                  </td>
                  <td className="px-3 py-2">
                    <Money value={a.outstandingAmount} />
                  </td>
                  <td className="max-w-48 truncate px-3 py-2">{a.reason ?? '—'}</td>
                  <td className="px-3 py-2 capitalize">{a.status}</td>
                  <td className="px-3 py-2 text-right">
                    {a.status === 'outstanding' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void waive(a.id)}>
                          Waive
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void voidAdvance(a.id)}
                        >
                          Void
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
