import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { useSessionStore } from '@renderer/stores/session'
import { AppError } from '@shared/errors'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.auth.login({ username, password })
      useSessionStore.getState().setSession({
        user,
        locked: false,
        setupRequired: false,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function onRecovery(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (newPassword.length < 8) {
        throw new AppError('VALIDATION_FAILED', 'Password must be at least 8 characters')
      }
      if (newPassword !== newPassword2) {
        throw new AppError('VALIDATION_FAILED', 'Passwords do not match')
      }
      const { user } = await api.auth.resetOwnerWithRecovery({
        username,
        recoveryCode,
        newPassword,
      })
      useSessionStore.getState().setSession({
        user,
        locked: false,
        setupRequired: false,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Recovery failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-sky-100 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-sky-950">{t('app.name')}</CardTitle>
          <CardDescription>
            {recoveryMode
              ? 'Reset the owner password with your recovery code'
              : t('login.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recoveryMode ? (
            <form className="space-y-4" onSubmit={(e) => void onRecovery(e)}>
              <div className="space-y-1.5">
                <Label htmlFor="username">Owner username</Label>
                <Input
                  id="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recovery">Recovery code</Label>
                <Input
                  id="recovery"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password (min 8)</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword2">Confirm new password</Label>
                <Input
                  id="newPassword2"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                Reset password &amp; sign in
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setRecoveryMode(false)
                  setError(null)
                }}
              >
                Back to login
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {t('action.login')}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-sky-800 underline"
                onClick={() => {
                  setRecoveryMode(true)
                  setError(null)
                }}
              >
                Forgot owner password? Use recovery code
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
