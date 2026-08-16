import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { promptDialog } from '@renderer/components/ConfirmDialog'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { ExpenseCategoryDto } from '@shared/contracts'
import { AppError } from '@shared/errors'

export function ExpenseCategoriesPage() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['expenseCategories', true],
    queryFn: () => api.expenseCategories.list(true),
  })
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | ''>('')
  const [mergeFrom, setMergeFrom] = useState<number | ''>('')
  const [mergeInto, setMergeInto] = useState<number | ''>('')

  const items = q.data?.items ?? []
  const parents = items.filter((c) => c.parentId == null && c.isActive)

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['expenseCategories'] })
  }

  async function create() {
    if (!name.trim()) return
    try {
      await api.expenseCategories.create({
        name: name.trim(),
        parentId: parentId === '' ? null : Number(parentId),
      })
      setName('')
      setParentId('')
      toast({ title: 'Category created', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Create failed',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    }
  }

  async function rename(c: ExpenseCategoryDto) {
    if (c.isSystem) {
      toast({ title: 'System categories cannot be renamed', variant: 'error' })
      return
    }
    const next = await promptDialog({
      title: 'Rename category',
      label: 'Name',
      defaultValue: c.name,
      confirmLabel: 'Rename',
    })
    if (!next?.trim() || next.trim() === c.name) return
    try {
      await api.expenseCategories.update({ id: c.id, name: next.trim() })
      toast({ title: 'Renamed', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Rename failed',
        variant: 'error',
      })
    }
  }

  async function toggleActive(c: ExpenseCategoryDto) {
    if (c.isSystem && c.isActive) {
      toast({ title: 'System categories cannot be deactivated', variant: 'error' })
      return
    }
    if (c.isActive && c.usageCount > 0) {
      toast({
        title: 'Category has expenses — deactivate or merge instead of delete',
        description: `${c.usageCount} active expenses. Use Merge below if this was a duplicate.`,
        variant: 'error',
      })
      // Still allow deactivate
    }
    try {
      await api.expenseCategories.update({ id: c.id, isActive: !c.isActive })
      toast({ title: c.isActive ? 'Deactivated' : 'Reactivated', variant: 'success' })
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Update failed',
        variant: 'error',
      })
    }
  }

  async function move(c: ExpenseCategoryDto, dir: -1 | 1) {
    const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = ordered.findIndex((x) => x.id === c.id)
    const swap = idx + dir
    if (swap < 0 || swap >= ordered.length) return
    ;[ordered[idx], ordered[swap]] = [ordered[swap]!, ordered[idx]!]
    try {
      await api.expenseCategories.reorder(ordered.map((x) => x.id))
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Reorder failed',
        variant: 'error',
      })
    }
  }

  async function merge() {
    if (mergeFrom === '' || mergeInto === '') {
      toast({ title: 'Pick both categories to merge', variant: 'error' })
      return
    }
    if (mergeFrom === mergeInto) {
      toast({ title: 'Cannot merge a category into itself', variant: 'error' })
      return
    }
    const from = items.find((c) => c.id === mergeFrom)
    const into = items.find((c) => c.id === mergeInto)
    if (
      !window.confirm(
        `Move all expenses from "${from?.name}" into "${into?.name}", then deactivate "${from?.name}"? Totals stay the same.`,
      )
    ) {
      return
    }
    try {
      const r = await api.expenseCategories.merge(Number(mergeFrom), Number(mergeInto))
      toast({ title: `Merged — ${r.moved} expenses moved`, variant: 'success' })
      setMergeFrom('')
      setMergeInto('')
      await refresh()
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Merge failed',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Expense categories"
        subtitle="Rename these to match how this plant talks about costs"
      />

      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs">Name</label>
          <Input className="w-56" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs">Parent (optional)</label>
          <select
            className="flex h-10 rounded-md border bg-white px-2 text-sm"
            value={parentId}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">None</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => void create()}>Add category</Button>
      </div>

      <div className="mb-6 rounded-lg border bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold">Merge categories</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Moves all expenses from A into B, then deactivates A. Totals are unchanged.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="h-10 rounded-md border px-2 text-sm"
            value={mergeFrom}
            onChange={(e) => setMergeFrom(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">From…</option>
            {items
              .filter((c) => !c.isSystem)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <span className="text-sm">→</span>
          <select
            className="h-10 rounded-md border px-2 text-sm"
            value={mergeInto}
            onChange={(e) => setMergeInto(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Into…</option>
            {items
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <Button variant="outline" onClick={() => void merge()}>
            Merge
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2 text-right">Uses</th>
              <th className="px-3 py-2 text-right">This month</th>
              <th className="px-3 py-2 text-right">This year</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {[...items]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="text-xs text-sky-700"
                        onClick={() => void move(c, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="text-xs text-sky-700"
                        onClick={() => void move(c, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {c.name}
                    {c.isSystem ? ' ' : null}
                    {c.isSystem && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-700">
                        System
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.parentName ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.usageCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money value={c.thisMonthTotal} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money value={c.thisYearTotal} />
                  </td>
                  <td className="px-3 py-2">{c.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {!c.isSystem && (
                        <button
                          type="button"
                          className="text-xs text-sky-700 underline"
                          onClick={() => void rename(c)}
                        >
                          Rename
                        </button>
                      )}
                      {!c.isSystem && (
                        <button
                          type="button"
                          className="text-xs text-slate-700 underline"
                          onClick={() => void toggleActive(c)}
                        >
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
