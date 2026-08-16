import { useQuery, useQueryClient } from '@tanstack/react-query'
import { promptDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { formatAppError } from '@renderer/lib/app-error-message'
import { useSessionStore } from '@renderer/stores/session'

export function PeriodsPage() {
  const qc = useQueryClient()
  const role = useSessionStore((s) => s.user?.role)
  const q = useQuery({
    queryKey: ['billing-periods'],
    queryFn: () => api.billing.periodsOverview(),
  })

  return (
    <div>
      <PageHeader
        title="Billing months"
        subtitle="Lock a month after billing so historical numbers stay fixed"
      />
      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Month</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Deliveries</th>
              <th className="p-2 text-right">Invoices</th>
              <th className="p-2 text-right">Revenue</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((p) => (
              <tr key={p.period} className="border-t">
                <td className="p-2 font-medium">{p.period}</td>
                <td className="p-2">{p.closed ? 'Closed' : 'Open'}</td>
                <td className="p-2 text-right tabular-nums">{p.deliveryCount}</td>
                <td className="p-2 text-right tabular-nums">{p.invoiceCount}</td>
                <td className="p-2 text-right">
                  <Money value={p.revenue} />
                </td>
                <td className="p-2">
                  {!p.closed ? (
                    <Button
                      size="sm"
                      data-testid={`period-close-${p.period}`}
                      onClick={() =>
                        void (async () => {
                          try {
                            await api.period.close(p.period)
                            toast({ title: `Locked ${p.period}`, variant: 'success' })
                            await qc.invalidateQueries({ queryKey: ['billing-periods'] })
                          } catch (e) {
                            toast({
                              title: 'Could not close this month',
                              description: formatAppError(e),
                              variant: 'error',
                            })
                          }
                        })()
                      }
                    >
                      Lock this month
                    </Button>
                  ) : role === 'owner' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`period-reopen-${p.period}`}
                      onClick={() =>
                        void (async () => {
                          const reason = await promptDialog({
                            title: `Reopen ${p.period}?`,
                            description:
                              'This unlocks the month so deliveries and bills can be changed again. Say why, in a few words.',
                            label: 'Reason',
                            placeholder: 'e.g. Missed a delivery for Ali House',
                            confirmLabel: 'Reopen month',
                          })
                          if (!reason) return
                          try {
                            await api.period.reopen(p.period, reason)
                            toast({ title: `Reopened ${p.period}`, variant: 'success' })
                            await qc.invalidateQueries({ queryKey: ['billing-periods'] })
                          } catch (e) {
                            toast({
                              title: 'Could not reopen this month',
                              description: formatAppError(e),
                              variant: 'error',
                            })
                          }
                        })()
                      }
                    >
                      Reopen
                    </Button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
