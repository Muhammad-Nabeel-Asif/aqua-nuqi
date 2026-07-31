import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@renderer/stores/ui'

type Item = { to: string; label: string }

export function CommandPalette({ items }: { items: Item[] }) {
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) => i.label.toLowerCase().includes(needle))
  }, [items, q])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to…"
          className="w-full border-b px-4 py-3 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && filtered[0]) {
              navigate(filtered[0].to)
              setOpen(false)
            }
          }}
        />
        <ul className="max-h-72 overflow-auto p-1">
          {filtered.map((item) => (
            <li key={item.to}>
              <button
                type="button"
                className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50"
                onClick={() => {
                  navigate(item.to)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
