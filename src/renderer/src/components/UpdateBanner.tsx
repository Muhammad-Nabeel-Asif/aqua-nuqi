import { useEffect, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useSessionStore } from '@renderer/stores/session'
import { AppError } from '@shared/errors'

type UpdateStatus = {
  updateDownloaded: boolean
  availableVersion: string | null
  releaseNotes: string | null
}

/**
 * Shows when a stable update has finished downloading.
 * Restart calls updates:install → pre-update backup → quitAndInstall.
 */
export function UpdateBanner() {
  const user = useSessionStore((s) => s.user)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user?.role !== 'owner') return
    void api.updates.status().then((s) => {
      if (s.updateDownloaded) setStatus(s)
    })
    return window.api.on('updates:downloaded', (payload) => {
      setStatus(payload as UpdateStatus)
    })
  }, [user?.role])

  if (user?.role !== 'owner' || !status?.updateDownloaded) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950">
      <div className="min-w-0">
        <p className="font-medium">
          Update {status.availableVersion ?? ''} downloaded — restart to install
        </p>
        {status.releaseNotes ? (
          <p className="truncate text-xs text-sky-800/80">{status.releaseNotes}</p>
        ) : (
          <p className="text-xs text-sky-800/80">
            A backup is taken automatically before installing.
          </p>
        )}
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            try {
              await api.updates.install()
            } catch (err) {
              toast({
                title: 'Could not install update',
                description: err instanceof AppError ? err.message : 'Error',
                variant: 'error',
              })
              setBusy(false)
            }
          })()
        }}
      >
        Restart &amp; install
      </Button>
    </div>
  )
}
