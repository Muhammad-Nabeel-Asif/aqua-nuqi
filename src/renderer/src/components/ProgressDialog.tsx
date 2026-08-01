import { Button } from './ui/button'

export function ProgressDialog({
  open,
  title,
  current,
  total,
  message,
  onCancel,
  cancelling,
}: {
  open: boolean
  title: string
  current: number
  total: number
  message?: string
  onCancel?: () => void
  cancelling?: boolean
}) {
  if (!open) return null
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {current} / {total}
          {message ? ` — ${message}` : ''}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {onCancel ? (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" disabled={cancelling} onClick={onCancel}>
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
