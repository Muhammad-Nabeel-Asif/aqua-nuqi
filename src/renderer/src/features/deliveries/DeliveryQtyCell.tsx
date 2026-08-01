import { useEffect, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type Props = {
  value: number | null
  placeholder?: number | null
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  onSave: (value: number | null) => Promise<void>
  onMove: (dir: 'up' | 'down' | 'left' | 'right' | 'enter') => void
  onOpenDetail?: () => void
}

/**
 * Keyboard-first quantity cell for daily/matrix/card entry.
 * Arrow keys move, Enter saves + down, Tab right, Esc cancels, digits start edit.
 */
export function DeliveryQtyCell({
  value,
  placeholder,
  disabled,
  autoFocus,
  className,
  onSave,
  onMove,
  onOpenDetail,
}: Props) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<SaveState>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlurSave = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value))
  }, [value, editing])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  async function commit(nextRaw: string, thenMove?: 'up' | 'down' | 'left' | 'right' | 'enter') {
    const trimmed = nextRaw.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && (!Number.isInteger(next) || next! < 0)) {
      setDraft(value == null ? '' : String(value))
      setEditing(false)
      return
    }
    const prev = value
    if (next === prev || (next == null && prev == null)) {
      setEditing(false)
      if (thenMove) onMove(thenMove)
      return
    }
    setState('saving')
    setEditing(false)
    try {
      await onSave(next)
      setState('saved')
      window.setTimeout(() => setState('idle'), 800)
    } catch {
      setDraft(prev == null ? '' : String(prev))
      setState('error')
      window.setTimeout(() => setState('idle'), 2000)
    }
    if (thenMove) onMove(thenMove)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (e.key === 'Escape') {
      e.preventDefault()
      skipBlurSave.current = true
      setDraft(value == null ? '' : String(value))
      setEditing(false)
      inputRef.current?.blur()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit(draft, 'enter')
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      void commit(draft, e.shiftKey ? 'left' : 'right')
      return
    }
    if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault()
      void commit(draft, 'down')
      return
    }
    if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault()
      void commit(draft, 'up')
      return
    }
    if (
      e.key === 'ArrowRight' &&
      (draft === '' || inputRef.current?.selectionStart === draft.length)
    ) {
      // only move if at end / empty to allow caret movement while editing
      if (!editing || draft === '' || inputRef.current?.selectionStart === draft.length) {
        if (!editing) {
          e.preventDefault()
          onMove('right')
        }
      }
      return
    }
    if (e.key === 'ArrowLeft' && (!editing || inputRef.current?.selectionStart === 0)) {
      if (!editing) {
        e.preventDefault()
        onMove('left')
      }
      return
    }
    if ((e.key === '+' || e.key === '=') && !editing) {
      e.preventDefault()
      const n = (value ?? 0) + 1
      setDraft(String(n))
      void commit(String(n))
      return
    }
    if (e.key === '-' && !editing) {
      e.preventDefault()
      const n = Math.max(0, (value ?? 0) - 1)
      setDraft(n === 0 && value == null ? '' : String(n))
      void commit(n === 0 && value == null ? '' : String(n))
      return
    }
    if (e.key === 'F2' || (e.key === '.' && e.altKey)) {
      e.preventDefault()
      onOpenDetail?.()
      return
    }
    if (/^\d$/.test(e.key) && !editing) {
      setEditing(true)
      setDraft(e.key)
      e.preventDefault()
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        inputMode="numeric"
        disabled={disabled}
        value={draft}
        placeholder={placeholder != null && value == null ? String(placeholder) : undefined}
        onChange={(e) => {
          setEditing(true)
          setDraft(e.target.value.replace(/[^\d]/g, ''))
        }}
        onFocus={() => {
          setEditing(true)
          inputRef.current?.select()
        }}
        onBlur={() => {
          if (skipBlurSave.current) {
            skipBlurSave.current = false
            return
          }
          void commit(draft)
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'h-8 w-14 rounded border bg-transparent px-1 text-center font-medium tabular-nums outline-none',
          'focus:border-sky-500 focus:ring-1 focus:ring-sky-500',
          disabled && 'cursor-not-allowed opacity-60',
          value == null && placeholder != null && 'placeholder:text-slate-300',
          state === 'error' && 'border-red-400',
          state === 'saved' && 'border-emerald-400',
          className,
        )}
      />
      {state === 'saving' && (
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
      )}
      {state === 'saved' && (
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
      )}
      {state === 'error' && (
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
      )}
    </div>
  )
}
