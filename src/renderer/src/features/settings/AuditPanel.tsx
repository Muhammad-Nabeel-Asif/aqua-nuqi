import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { DateText } from '@renderer/components/DateText'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'

export function AuditPanel() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['audit', from, to, action, search],
    queryFn: () =>
      api.audit.list({
        from: from || undefined,
        to: to || undefined,
        action: action || undefined,
        search: search || undefined,
        limit: 200,
      }),
  })

  async function exportExcel() {
    try {
      const folder = await api.dialog.pickFolder({ title: 'Save audit export' })
      if (!folder.path) return
      const result = await api.audit.export({
        format: 'excel',
        destinationFolder: folder.path,
        from: from || undefined,
        to: to || undefined,
        action: action || undefined,
        search: search || undefined,
      })
      toast({ title: 'Exported', description: result.filePath, variant: 'success' })
      await api.shell.openPath(folder.path)
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Every create, update, void, login, backup and restore is recorded here with before/after
        values.
      </p>
      <div className="grid gap-2 md:grid-cols-4">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Action</Label>
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. void"
          />
        </div>
        <div className="space-y-1">
          <Label>Search summary</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh
        </Button>
        <Button variant="outline" onClick={() => void exportExcel()}>
          Export Excel
        </Button>
      </div>
      <p className="text-xs text-slate-500">{query.data?.total ?? 0} matching entries</p>
      <div className="max-h-[480px] overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="p-2">When</th>
              <th className="p-2">User</th>
              <th className="p-2">Action</th>
              <th className="p-2">Summary</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.items ?? []).map((row) => (
              <Fragment key={row.id}>
                <tr
                  className="cursor-pointer border-t hover:bg-sky-50"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <td className="p-2 whitespace-nowrap">
                    <DateText value={row.occurredAt} />
                  </td>
                  <td className="p-2">{row.username ?? '—'}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2">{row.summary}</td>
                </tr>
                {expanded === row.id ? (
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="p-3">
                      {row.diff.length === 0 ? (
                        <span className="text-slate-500">No field-level changes recorded.</span>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className="p-1 text-left">Field</th>
                              <th className="p-1 text-left">Old</th>
                              <th className="p-1 text-left">New</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.diff.map((d) => (
                              <tr key={d.field} className="border-t">
                                <td className="p-1 font-medium">{d.field}</td>
                                <td className="p-1 text-red-700">{d.oldValue ?? '∅'}</td>
                                <td className="p-1 text-emerald-700">{d.newValue ?? '∅'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
