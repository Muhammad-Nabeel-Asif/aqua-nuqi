import { create } from 'zustand'
import { Button } from './ui/button'

type ConfirmRequest = {
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

type State = {
  current: ConfirmRequest | null
  ask: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  close: (ok: boolean) => void
}

export const useConfirmStore = create<State>((set, get) => ({
  current: null,
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      set({ current: { ...req, resolve } })
    }),
  close: (ok) => {
    const cur = get().current
    cur?.resolve(ok)
    set({ current: null })
  },
}))

export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return useConfirmStore.getState().ask(req)
}

export function ConfirmDialogHost() {
  const current = useConfirmStore((s) => s.current)
  const close = useConfirmStore((s) => s.close)
  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{current.title}</h2>
        {current.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{current.description}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={current.danger ? 'destructive' : 'default'} onClick={() => close(true)}>
            {current.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
