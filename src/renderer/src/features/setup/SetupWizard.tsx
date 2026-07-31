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
import { useSessionStore } from '@renderer/stores/session'
import { AppError } from '@shared/errors'

type Path = 'choose' | 'new' | 'restore'

export function SetupWizard() {
  const navigate = useNavigate()
  const [path, setPath] = useState<Path>('choose')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [businessName, setBusinessName] = useState('Aqua Nuqi')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [currencySymbol, setCurrencySymbol] = useState('Rs')
  const [dateFormat, setDateFormat] = useState('dd-MM-yyyy')
  const [backupFolder, setBackupFolder] = useState('')
  const [ownerUsername, setOwnerUsername] = useState('owner')
  const [ownerDisplayName, setOwnerDisplayName] = useState('Owner')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerPassword2, setOwnerPassword2] = useState('')
  const [backupFile, setBackupFile] = useState('')

  async function pickBackupFolder() {
    const res = await api.dialog.pickFolder({ title: 'Choose backup folder' })
    if (res.path) setBackupFolder(res.path)
  }

  async function pickBackupFile() {
    const res = await api.dialog.pickFile({
      title: 'Choose a backup database',
      filters: [{ name: 'SQLite backup', extensions: ['db', 'sqlite'] }],
    })
    if (res.path) setBackupFile(res.path)
  }

  async function finishNew() {
    setError(null)
    if (ownerPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (ownerPassword !== ownerPassword2) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const { user } = await api.setup.complete({
        businessName,
        address,
        phone,
        currencyCode: 'PKR',
        currencySymbol,
        dateFormat,
        decimalPlaces: 0,
        backupFolder,
        ownerUsername,
        ownerDisplayName,
        ownerPassword,
      })
      useSessionStore.getState().setSession({
        user,
        locked: false,
        setupRequired: false,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  async function finishRestore() {
    setError(null)
    if (!backupFile) {
      setError('Choose a backup file')
      return
    }
    setBusy(true)
    try {
      await api.setup.restore({ backupFilePath: backupFile })
      const session = await api.auth.session()
      useSessionStore.getState().setSession({
        user: session.user,
        locked: session.locked,
        setupRequired: session.setupRequired,
      })
      navigate(session.user ? '/' : '/login')
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  if (path === 'choose') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-xl border-sky-100 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-sky-950">Welcome to Aqua Nuqi</CardTitle>
            <CardDescription>
              Offline water-plant management. Choose how to get started on this computer.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button className="h-12 justify-start" onClick={() => setPath('new')}>
              Set up a new business
            </Button>
            <Button
              variant="outline"
              className="h-12 justify-start"
              onClick={() => setPath('restore')}
            >
              Restore from a backup
            </Button>
            <p className="text-xs text-muted-foreground">
              Moving to a new laptop? Use restore and pick the backup file from your USB drive.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (path === 'restore') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Restore from a backup</CardTitle>
            <CardDescription>
              Select a database backup created by Aqua Nuqi. Pending migrations will run
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Backup file</Label>
              <div className="flex gap-2">
                <Input readOnly value={backupFile} placeholder="No file selected" />
                <Button type="button" variant="secondary" onClick={() => void pickBackupFile()}>
                  Browse
                </Button>
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setPath('choose')}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => void finishRestore()}>
                Restore and continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const steps = ['Business profile', 'Locale', 'Backup folder', 'Owner account']

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Set up a new business</CardTitle>
          <CardDescription>
            Step {step + 1} of {steps.length}: {steps[step]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              <Field label="Business name" value={businessName} onChange={setBusinessName} />
              <Field label="Address" value={address} onChange={setAddress} />
              <Field label="Phone" value={phone} onChange={setPhone} />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Field label="Currency symbol" value={currencySymbol} onChange={setCurrencySymbol} />
              <Field label="Date format" value={dateFormat} onChange={setDateFormat} />
            </>
          ) : null}
          {step === 2 ? (
            <div className="space-y-1.5">
              <Label>Backup folder</Label>
              <div className="flex gap-2">
                <Input readOnly value={backupFolder} placeholder="Default (recommended)" />
                <Button type="button" variant="secondary" onClick={() => void pickBackupFolder()}>
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default folder inside app data.
              </p>
            </div>
          ) : null}
          {step === 3 ? (
            <>
              <Field label="Username" value={ownerUsername} onChange={setOwnerUsername} />
              <Field label="Display name" value={ownerDisplayName} onChange={setOwnerDisplayName} />
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  value={ownerPassword2}
                  onChange={(e) => setOwnerPassword2(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (step === 0) setPath('choose')
                else setStep((s) => s - 1)
              }}
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                onClick={() => {
                  if (step === 0 && !businessName.trim()) {
                    setError('Business name is required')
                    return
                  }
                  setError(null)
                  setStep((s) => s + 1)
                }}
              >
                Continue
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void finishNew()}>
                Finish and sign in
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
