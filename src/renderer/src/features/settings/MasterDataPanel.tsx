import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { AreaDto, ProductDto, RouteDto } from '@shared/contracts'

export function MasterDataPanel() {
  const [tab, setTab] = useState<'areas' | 'routes' | 'products'>('areas')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<AreaDto | RouteDto | ProductDto>()
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
  async function save() {
    try {
      if (tab === 'areas') {
        if (editing) await api.areas.update({ id: editing.id, name })
        else await api.areas.create({ name })
      } else if (tab === 'routes') {
        if (editing) await api.routes.update({ id: editing.id, name })
        else await api.routes.create({ name })
      } else {
        if (editing) await api.products.update({ id: editing.id, name })
        else
          await api.products.create({
            name,
            kind: 'service',
            isReturnable: false,
            defaultRate: 0,
            defaultDeposit: 0,
            trackStock: false,
          })
      }
      setName('')
      setEditing(undefined)
      await qc.invalidateQueries()
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
  const items: (AreaDto | RouteDto | ProductDto)[] =
    tab === 'areas'
      ? (areas.data?.items ?? [])
      : tab === 'routes'
        ? (routes.data?.items ?? [])
        : (products.data?.items ?? [])
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-3 flex gap-2">
          {(['areas', 'routes', 'products'] as const).map((x) => (
            <Button
              key={x}
              variant={tab === x ? 'default' : 'outline'}
              onClick={() => {
                setTab(x)
                setEditing(undefined)
              }}
            >
              {x[0].toUpperCase() + x.slice(1)}
            </Button>
          ))}
        </div>
        <div className="rounded border bg-white">
          {items.map((item) => (
            <div
              className="flex items-center justify-between border-b px-4 py-3 text-sm"
              key={item.id}
            >
              <span>
                {item.name} {'isDefault' in item && item.isDefault && <small>(default)</small>}
              </span>
              <span className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(item)
                    setName(item.name)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  disabled={'isDefault' in item && item.isDefault}
                  onClick={() => void toggle(item)}
                >
                  {item.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold">
          {editing ? 'Edit' : 'Add'} {tab.slice(0, -1)}
        </h3>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Button className="mt-3" onClick={() => void save()} disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </div>
  )
}
