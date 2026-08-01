import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'

export function BottlesOutPage() {
  const [search, setSearch] = useState('')
  const [routeId, setRouteId] = useState('')
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })
  const q = useQuery({
    queryKey: ['deliveries', 'bottlesOut', search, routeId],
    queryFn: () =>
      api.deliveries.bottlesOut({
        search: search || undefined,
        routeId: routeId ? Number(routeId) : undefined,
      }),
  })

  return (
    <div>
      <PageHeader
        title="Bottles out"
        subtitle="Customers holding bottles, sorted by quantity"
        actions={
          <Button variant="outline" asChild>
            <Link to="/deliveries/daily">Daily entry</Link>
          </Button>
        }
      />
      <div className="mb-3 flex gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-2 text-sm"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">All routes</option>
          {(routes.data?.items ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2 text-right">Bottles</th>
              <th className="px-3 py-2 text-right">Deposit held</th>
              <th className="px-3 py-2 text-right">Days since delivery</th>
              <th className="px-3 py-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((r) => (
              <tr
                key={r.customerId}
                className={`border-t ${r.depositShortfall ? 'bg-amber-50' : ''}`}
              >
                <td className="px-3 py-2">
                  <Link className="text-sky-800" to={`/customers/${r.customerId}`}>
                    {r.code}
                  </Link>{' '}
                  {r.name}
                  {r.depositShortfall && (
                    <span className="ml-2 text-xs text-amber-800">Deposit short</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.routeName ?? '—'}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {r.bottlesWithCustomer}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={r.securityDepositHeld} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.daysSinceLastReturn ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {r.phonePrimary ?? '—'}
                  {r.whatsappNumber && (
                    <a
                      className="ml-2 text-sky-700"
                      href={`https://wa.me/${r.whatsappNumber.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.data?.items.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">No bottles currently out.</p>
        )}
      </div>
    </div>
  )
}
