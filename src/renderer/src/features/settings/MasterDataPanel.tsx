import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { PRODUCT_KIND_LABEL, plainLabel } from '@renderer/lib/plain-labels'
import type { AreaDto, ProductDto, RouteDto } from '@shared/contracts'
import { toPaisa } from '@shared/money'

type Tab = 'areas' | 'routes' | 'products'

type ProductForm = {
  name: string
  sizeLiters: string
  kind: ProductDto['kind']
  isReturnable: boolean
  defaultRate: string
  defaultDeposit: string
  trackStock: boolean
}

const emptyProduct = (): ProductForm => ({
  name: '',
  sizeLiters: '',
  kind: 'returnable_bottle',
  isReturnable: true,
  defaultRate: '60',
  defaultDeposit: '0',
  trackStock: true,
})

export function MasterDataPanel() {
  const [tab, setTab] = useState<Tab>('areas')
  const [editing, setEditing] = useState<AreaDto | RouteDto | ProductDto>()
  const [areaName, setAreaName] = useState('')
  const [routeName, setRouteName] = useState('')
  const [routeAreaId, setRouteAreaId] = useState('')
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct())
  const qc = useQueryClient()

  const areas = useQuery({
    queryKey: ['areas', 'master'],
    queryFn: () => api.areas.list({ includeInactive: true }),
  })
  const routes = useQuery({
    queryKey: ['routes', 'master'],
    queryFn: () => api.routes.list({ includeInactive: true }),
  })
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list({ includeInactive: true }),
  })

  useEffect(() => {
    setEditing(undefined)
    setAreaName('')
    setRouteName('')
    setRouteAreaId('')
    setProductForm(emptyProduct())
  }, [tab])

  function startEdit(item: AreaDto | RouteDto | ProductDto) {
    setEditing(item)
    if (tab === 'areas') setAreaName(item.name)
    else if (tab === 'routes') {
      const r = item as RouteDto
      setRouteName(r.name)
      setRouteAreaId(r.areaId == null ? '' : String(r.areaId))
    } else {
      const p = item as ProductDto
      setProductForm({
        name: p.name,
        sizeLiters: p.sizeLiters == null ? '' : String(p.sizeLiters),
        kind: p.kind,
        isReturnable: p.isReturnable,
        defaultRate: String(p.defaultRate / 100),
        defaultDeposit: String(p.defaultDeposit / 100),
        trackStock: p.trackStock,
      })
    }
  }

  async function save() {
    try {
      if (tab === 'areas') {
        if (!areaName.trim()) return
        if (editing) await api.areas.update({ id: editing.id, name: areaName })
        else await api.areas.create({ name: areaName })
      } else if (tab === 'routes') {
        if (!routeName.trim()) return
        const areaId = routeAreaId ? Number(routeAreaId) : null
        if (editing) await api.routes.update({ id: editing.id, name: routeName, areaId })
        else await api.routes.create({ name: routeName, areaId })
      } else {
        if (!productForm.name.trim()) return
        const payload = {
          name: productForm.name,
          sizeLiters: productForm.sizeLiters ? Number(productForm.sizeLiters) : null,
          kind: productForm.kind,
          isReturnable: productForm.isReturnable,
          defaultRate: toPaisa(productForm.defaultRate || 0),
          defaultDeposit: toPaisa(productForm.defaultDeposit || 0),
          trackStock: productForm.trackStock,
        }
        if (editing) await api.products.update({ id: editing.id, ...payload })
        else await api.products.create(payload)
      }
      setEditing(undefined)
      setAreaName('')
      setRouteName('')
      setRouteAreaId('')
      setProductForm(emptyProduct())
      await qc.invalidateQueries()
      toast({ title: 'Saved', variant: 'success' })
    } catch (e) {
      toast({
        title: 'Could not save master data',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function toggle(item: AreaDto | RouteDto | ProductDto) {
    try {
      if (tab === 'areas') await api.areas.update({ id: item.id, isActive: !item.isActive })
      else if (tab === 'routes') await api.routes.update({ id: item.id, isActive: !item.isActive })
      else if (!('isDefault' in item) || !item.isDefault)
        await api.products.update({ id: item.id, isActive: !item.isActive })
      await qc.invalidateQueries()
    } catch (e) {
      toast({
        title: 'Cannot change status',
        description: e instanceof Error ? e.message : 'Area may have active customers',
        variant: 'error',
      })
    }
  }

  async function moveRoute(id: number, direction: -1 | 1) {
    const list = [...(routes.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = list.findIndex((r) => r.id === id)
    const swap = idx + direction
    if (idx < 0 || swap < 0 || swap >= list.length) return
    ;[list[idx], list[swap]] = [list[swap]!, list[idx]!]
    try {
      await api.routes.reorder(list.map((r) => r.id))
      await qc.invalidateQueries({ queryKey: ['routes'] })
    } catch (e) {
      toast({
        title: 'Reorder failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
    }
  }

  const areaItems = areas.data?.items ?? []
  const routeItems = [...(routes.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const productItems = products.data?.items ?? []

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex gap-2">
          {(['areas', 'routes', 'products'] as const).map((x) => (
            <Button key={x} variant={tab === x ? 'default' : 'outline'} onClick={() => setTab(x)}>
              {x[0]!.toUpperCase() + x.slice(1)}
            </Button>
          ))}
        </div>
        <div className="rounded border bg-white">
          {tab === 'areas' &&
            areaItems.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                subtitle={item.isActive ? undefined : 'Inactive'}
                onEdit={() => startEdit(item)}
                onToggle={() => void toggle(item)}
                active={item.isActive}
              />
            ))}
          {tab === 'routes' &&
            routeItems.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                subtitle={[item.areaName ?? 'No area', item.isActive ? null : 'Inactive']
                  .filter(Boolean)
                  .join(' · ')}
                onEdit={() => startEdit(item)}
                onToggle={() => void toggle(item)}
                active={item.isActive}
                extra={
                  <span className="flex gap-1">
                    <Button variant="ghost" onClick={() => void moveRoute(item.id, -1)}>
                      ↑
                    </Button>
                    <Button variant="ghost" onClick={() => void moveRoute(item.id, 1)}>
                      ↓
                    </Button>
                  </span>
                }
              />
            ))}
          {tab === 'products' &&
            productItems.map((item) => (
              <Row
                key={item.id}
                title={`${item.name}${item.isDefault ? ' (default)' : ''}`}
                subtitle={`${item.sizeLiters ?? '—'} L · Rs ${(item.defaultRate / 100).toFixed(0)} · ${plainLabel(PRODUCT_KIND_LABEL, item.kind)}`}
                onEdit={() => startEdit(item)}
                onToggle={() => void toggle(item)}
                active={item.isActive}
                disableToggle={item.isDefault}
              />
            ))}
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold">
          {editing ? 'Edit' : 'Add'} {tab.slice(0, -1)}
        </h3>

        {tab === 'areas' && (
          <div className="space-y-3">
            <Field label="Name" value={areaName} onChange={setAreaName} />
            <Button onClick={() => void save()} disabled={!areaName.trim()}>
              Save
            </Button>
          </div>
        )}

        {tab === 'routes' && (
          <div className="space-y-3">
            <Field label="Name" value={routeName} onChange={setRouteName} />
            <div className="space-y-1.5">
              <Label>Area</Label>
              <select
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={routeAreaId}
                onChange={(e) => setRouteAreaId(e.target.value)}
              >
                <option value="">None</option>
                {areaItems
                  .filter((a) => a.isActive)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button onClick={() => void save()} disabled={!routeName.trim()}>
              Save
            </Button>
          </div>
        )}

        {tab === 'products' && (
          <div className="space-y-3">
            <Field
              label="Name"
              value={productForm.name}
              onChange={(v) => setProductForm((f) => ({ ...f, name: v }))}
            />
            <Field
              label="Size (liters)"
              value={productForm.sizeLiters}
              onChange={(v) => setProductForm((f) => ({ ...f, sizeLiters: v }))}
              type="number"
            />
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <select
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={productForm.kind}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, kind: e.target.value as ProductDto['kind'] }))
                }
              >
                {(
                  ['returnable_bottle', 'packaged_water', 'equipment', 'rental', 'service'] as const
                ).map((k) => (
                  <option key={k} value={k}>
                    {plainLabel(PRODUCT_KIND_LABEL, k)}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Default rate (Rs)"
              value={productForm.defaultRate}
              onChange={(v) => setProductForm((f) => ({ ...f, defaultRate: v }))}
              type="number"
            />
            <Field
              label="Default deposit (Rs)"
              value={productForm.defaultDeposit}
              onChange={(v) => setProductForm((f) => ({ ...f, defaultDeposit: v }))}
              type="number"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={productForm.isReturnable}
                onChange={(e) => setProductForm((f) => ({ ...f, isReturnable: e.target.checked }))}
              />
              Returnable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={productForm.trackStock}
                onChange={(e) => setProductForm((f) => ({ ...f, trackStock: e.target.checked }))}
              />
              Track stock
            </label>
            <Button onClick={() => void save()} disabled={!productForm.name.trim()}>
              Save
            </Button>
          </div>
        )}

        {editing && (
          <Button
            className="mt-2"
            variant="outline"
            onClick={() => {
              setEditing(undefined)
              setAreaName('')
              setRouteName('')
              setRouteAreaId('')
              setProductForm(emptyProduct())
            }}
          >
            Cancel edit
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({
  title,
  subtitle,
  onEdit,
  onToggle,
  active,
  disableToggle,
  extra,
}: {
  title: string
  subtitle?: string
  onEdit: () => void
  onToggle: () => void
  active: boolean
  disableToggle?: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
      <div>
        <div>{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <span className="flex items-center gap-1">
        {extra}
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" disabled={disableToggle} onClick={onToggle}>
          {active ? 'Deactivate' : 'Activate'}
        </Button>
      </span>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
