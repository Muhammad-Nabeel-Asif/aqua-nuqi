import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { ListCustomersInput } from '@shared/contracts'
import { BulkRateDialog } from './BulkRateDialog'
import { CustomerFormDialog } from './CustomerFormDialog'
import { ImportWizard } from './ImportWizard'

export function CustomersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ListCustomersInput['status']>()
  const [type, setType] = useState<ListCustomersInput['customerType']>()
  const [hasOutstanding, setHasOutstanding] = useState(false)
  const [holdsBottles, setHoldsBottles] = useState(false)
  const [bulkArea, setBulkArea] = useState('')
  const [bulkRoute, setBulkRoute] = useState('')
  const [areaId, setAreaId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<NonNullable<ListCustomersInput['sortBy']>>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.areas.list() })
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api.routes.list() })
  const query = useQuery({
    queryKey: [
      'customers',
      { search, status, type, areaId, routeId, hasOutstanding, holdsBottles, sortBy, sortDir },
    ],
    queryFn: () =>
      api.customers.list({
        search: search || undefined,
        // Empty select option is ""; Zod enums reject "" so omit instead of clearing the list.
        status: status || undefined,
        customerType: type || undefined,
        areaId: areaId ? Number(areaId) : undefined,
        routeId: routeId ? Number(routeId) : undefined,
        hasOutstanding: hasOutstanding || undefined,
        holdsBottles: holdsBottles || undefined,
        sortBy,
        sortDir,
        limit: 5000,
      }),
  })
  const rows = query.data?.items ?? []
  const parentRef = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    overscan: 8,
  })
  const columns = [
    ['code', 'Code'],
    ['name', 'Name'],
    ['phone', 'Phone'],
    ['area', 'Area'],
    ['route', 'Route'],
    ['rate', 'Rate'],
    ['bottles', 'Bottles'],
    ['balance', 'Balance'],
    ['status', 'Status'],
  ] as const
  function sort(key: NonNullable<ListCustomersInput['sortBy']>) {
    setSortDir(sortBy === key && sortDir === 'asc' ? 'desc' : 'asc')
    setSortBy(key)
  }
  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  async function bulkStatus(value: 'active' | 'paused' | 'inactive') {
    try {
      await api.customers.bulkUpdate({ ids: selected, status: value })
      setSelected([])
      await qc.invalidateQueries({ queryKey: ['customers'] })
      toast({ title: 'Customers updated', variant: 'success' })
    } catch (e) {
      toast({
        title: 'Bulk update failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }
  async function bulkLocation(kind: 'area' | 'route', value: string) {
    try {
      await api.customers.bulkUpdate({
        ids: selected,
        ...(kind === 'area' ? { areaId: Number(value) } : { routeId: Number(value) }),
      })
      setSelected([])
      await qc.invalidateQueries({ queryKey: ['customers'] })
      toast({ title: 'Customers updated', variant: 'success' })
    } catch (e) {
      toast({
        title: 'Bulk update failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }
  async function exportCustomers() {
    const r = await api.customers.export('csv')
    const a = document.createElement('a')
    a.href = `data:${r.mimeType};base64,${r.base64}`
    a.download = r.fileName
    a.click()
  }

  async function exportCustomersPdf() {
    const items = query.data?.items ?? []
    try {
      const r = await api.pdf.exportTable({
        title: 'Customers',
        fileName: 'customers.pdf',
        openAfter: true,
        orientation: 'landscape',
        filters: [
          ...(search ? [{ label: 'Search', value: search }] : []),
          ...(status ? [{ label: 'Status', value: status }] : []),
          ...(type ? [{ label: 'Type', value: type }] : []),
        ],
        columns: [
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Name' },
          { key: 'area', header: 'Area' },
          { key: 'route', header: 'Route' },
          { key: 'phone', header: 'Phone' },
          { key: 'balance', header: 'Balance', align: 'right' },
          { key: 'bottles', header: 'Bottles', align: 'right' },
          { key: 'status', header: 'Status' },
        ],
        rows: items.map((c) => ({
          code: c.code,
          name: c.name,
          area: c.areaName ?? '',
          route: c.routeName ?? '',
          phone: c.phonePrimary ?? '',
          balance: c.balance,
          bottles: c.bottlesWithCustomer,
          status: c.status,
        })),
      })
      toast({ title: 'Customers PDF saved', description: r.path, variant: 'success' })
    } catch (e) {
      toast({
        title: 'PDF export failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }
  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${query.data?.total ?? 0} customers`}
        actions={<Button onClick={() => setFormOpen(true)}>New customer</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={areaId}
          onChange={setAreaId}
          options={areas.data?.items.map((a) => [a.id, a.name]) ?? []}
          placeholder="All areas"
        />
        <Select
          value={routeId}
          onChange={setRouteId}
          options={routes.data?.items.map((r) => [r.id, r.name]) ?? []}
          placeholder="All routes"
        />
        <Select
          value={status ?? ''}
          onChange={(value) =>
            setStatus(value ? (value as NonNullable<ListCustomersInput['status']>) : undefined)
          }
          options={['active', 'paused', 'inactive'].map((x) => [x, x])}
          placeholder="All statuses"
        />
        <Select
          value={type ?? ''}
          onChange={(value) =>
            setType(value ? (value as NonNullable<ListCustomersInput['customerType']>) : undefined)
          }
          options={['residential', 'commercial', 'walk_in'].map((x) => [x, x])}
          placeholder="All types"
        />
        <label className="flex items-center gap-2 self-center text-sm">
          <input
            type="checkbox"
            checked={hasOutstanding}
            onChange={(e) => setHasOutstanding(e.target.checked)}
          />
          Has outstanding
        </label>
        <label className="flex items-center gap-2 self-center text-sm">
          <input
            type="checkbox"
            checked={holdsBottles}
            onChange={(e) => setHoldsBottles(e.target.checked)}
          />
          Holds bottles
        </label>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          Import
        </Button>
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          Bulk rate change
        </Button>
        <Button variant="outline" onClick={() => void exportCustomers()}>
          Export CSV
        </Button>
        <Button variant="outline" onClick={() => void exportCustomersPdf()}>
          Export PDF
        </Button>
        {selected.length > 0 && (
          <>
            <span className="self-center text-sm">{selected.length} selected</span>
            <Select
              value=""
              onChange={(v) => void bulkStatus(v as 'active' | 'paused' | 'inactive')}
              options={['active', 'paused', 'inactive'].map((x) => [x, `Set ${x}`])}
              placeholder="Bulk status…"
            />
            <Select
              value={bulkArea}
              onChange={(v) => {
                setBulkArea(v)
                void bulkLocation('area', v)
              }}
              options={areas.data?.items.map((a) => [a.id, a.name]) ?? []}
              placeholder="Change area…"
            />
            <Select
              value={bulkRoute}
              onChange={(v) => {
                setBulkRoute(v)
                void bulkLocation('route', v)
              }}
              options={routes.data?.items.map((r) => [r.id, r.name]) ?? []}
              placeholder="Change route…"
            />
          </>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="grid grid-cols-[32px_repeat(9,minmax(90px,1fr))] border-b bg-sky-50 text-xs font-semibold text-slate-600">
          {<div />}
          {columns.map(([key, label]) => (
            <button key={key} className="px-3 py-3 text-left" onClick={() => sort(key)}>
              {label}
              {sortBy === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
        <div
          ref={parentRef}
          className="h-[calc(100vh-260px)] overflow-auto"
          style={{ contain: 'strict' }}
        >
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            {virtual.getVirtualItems().map((v) => {
              const c = rows[v.index]
              return (
                <div
                  key={c.id}
                  className="absolute left-0 grid w-full grid-cols-[32px_repeat(9,minmax(90px,1fr))] items-center border-b text-sm hover:bg-sky-50"
                  style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <button
                    className="contents text-left"
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <span className="px-3 py-3 font-medium text-sky-700">{c.code}</span>
                    <span className="px-3 py-3">{c.name}</span>
                    <span className="px-3 py-3">{c.phonePrimary ?? '—'}</span>
                    <span className="px-3 py-3">{c.areaName ?? '—'}</span>
                    <span className="px-3 py-3">{c.routeName ?? '—'}</span>
                    <span className="px-3 py-3">
                      <Money value={c.currentRate ?? 0} />
                    </span>
                    <span className="px-3 py-3">{c.bottlesWithCustomer}</span>
                    <span className="px-3 py-3">
                      <Money value={c.balance} creditSuffix />
                    </span>
                    <span className="px-3 py-3 capitalize">{c.status}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {formOpen && (
        <CustomerFormDialog
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            void qc.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}
      {importOpen && (
        <ImportWizard
          onClose={() => setImportOpen(false)}
          onSaved={() => {
            setImportOpen(false)
            void qc.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}
      {bulkOpen && (
        <BulkRateDialog
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false)
            void qc.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}
    </div>
  )
}
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: (string | number)[][]
  placeholder: string
}) {
  return (
    <select
      className="h-9 rounded-md border px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map(([id, label]) => (
        <option key={String(id)} value={String(id)}>
          {label}
        </option>
      ))}
    </select>
  )
}
