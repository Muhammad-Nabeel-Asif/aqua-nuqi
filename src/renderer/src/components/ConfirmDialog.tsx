import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

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

type PromptRequest = {
  title: string
  description?: string
  label?: string
  placeholder?: string
  defaultValue?: string
  inputType?: 'text' | 'password'
  confirmLabel?: string
  danger?: boolean
  resolve: (value: string | null) => void
}

type PromptState = {
  current: PromptRequest | null
  ask: (req: Omit<PromptRequest, 'resolve'>) => Promise<string | null>
  close: (value: string | null) => void
}

const usePromptStore = create<PromptState>((set, get) => ({
  current: null,
  ask: (req) =>
    new Promise<string | null>((resolve) => {
      set({ current: { ...req, resolve } })
    }),
  close: (value) => {
    const cur = get().current
    cur?.resolve(value)
    set({ current: null })
  },
}))

/** In-app prompt — `window.prompt` does not show in Electron. */
export function promptDialog(req: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return usePromptStore.getState().ask(req)
}

export function PromptDialogHost() {
  const current = usePromptStore((s) => s.current)
  const close = usePromptStore((s) => s.close)
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(current?.defaultValue ?? '')
  }, [current])

  if (!current) return null

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    setValue('')
    close(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{current.title}</h2>
        {current.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{current.description}</p>
        ) : null}
        <div className="mt-4">
          {current.label ? (
            <Label className="mb-1 block text-xs text-muted-foreground">{current.label}</Label>
          ) : null}
          <Input
            autoFocus
            type={current.inputType ?? 'text'}
            value={value}
            placeholder={current.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setValue('')
              close(null)
            }}
          >
            Cancel
          </Button>
          <Button
            variant={current.danger ? 'destructive' : 'default'}
            disabled={!value.trim()}
            onClick={submit}
          >
            {current.confirmLabel ?? 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}
