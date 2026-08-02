import { useState } from 'react'
import { AppLogo, BRAND_NAME } from '@renderer/brand'
import { api } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { useSessionStore } from '@renderer/stores/session'
import { AppError } from '@shared/errors'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

export function LockOverlay() {
  const user = useSessionStore((s) => s.user)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function unlockWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.unlock({ password })
      useSessionStore.getState().setSession({
        user,
        locked: false,
        setupRequired: false,
      })
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  async function unlockWithPin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.unlock({ pin })
      useSessionStore.getState().setSession({
        user,
        locked: false,
        setupRequired: false,
      })
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-2xl">
        <AppLogo size="md" title={BRAND_NAME} className="mb-4" />
        <h2 className="text-xl font-bold text-sky-950">Session locked</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user?.displayName}. Enter password or PIN to continue.
        </p>

        <form className="mt-5 space-y-3" onSubmit={(e) => void unlockWithPassword(e)}>
          <div className="space-y-1.5">
            <Label htmlFor="unlock-password">Password</Label>
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {t('action.unlock')}
          </Button>
        </form>

        {user?.hasPin ? (
          <form className="mt-4 space-y-3" onSubmit={(e) => void unlockWithPin(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="unlock-pin">PIN</Label>
              <Input
                id="unlock-pin"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={6}
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={busy || !pin}>
              Unlock with PIN
            </Button>
          </form>
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
