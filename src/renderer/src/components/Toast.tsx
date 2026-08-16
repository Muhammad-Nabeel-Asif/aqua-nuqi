import { create } from 'zustand'
import { cn } from '@renderer/lib/utils'

type ToastItem = {
  id: string
  title: string
  description?: string
  variant?: 'success' | 'error'
  code?: string
}

type ToastState = {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
  clearErrors: () => void
  clearAll: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = crypto.randomUUID()
    set((s) => ({ items: [...s.items, { ...item, id }] }))
    if (item.variant !== 'error') {
      setTimeout(() => {
        set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
      }, 2000)
    }
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
  clearErrors: () => set((s) => ({ items: s.items.filter((t) => t.variant !== 'error') })),
  clearAll: () => set({ items: [] }),
}))

export function toast(item: Omit<ToastItem, 'id'>): void {
  useToastStore.getState().push(item)
}

export function ToastViewport() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto rounded-md border bg-white p-3 shadow-lg',
            item.variant === 'error' && 'border-destructive/40',
            item.variant === 'success' && 'border-success/40',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              ) : null}
              {item.code ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Code: {item.code}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(item.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
