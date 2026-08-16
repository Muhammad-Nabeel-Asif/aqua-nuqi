import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { DateText } from '@renderer/components/DateText'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { AppError } from '@shared/errors'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupPanel() {
  const qc = useQueryClient()
  const statusQuery = useQuery({
    queryKey: ['backup', 'status'],
    queryFn: () => api.backup.status(),
  })
  const listQuery = useQuery({ queryKey: ['backup', 'list'], queryFn: () => api.backup.list() })
  const settingsQuery = useQuery({
    queryKey: ['settings', 'backup'],
    queryFn: () =>
      api.settings.get({
        keys: [
          'backup.folder',
          'backup.secondaryFolder',
          'backup.onExit',
          'backup.daily',
          'backup.weekly',
          'backup.keepDaily',
          'backup.keepWeekly',
          'backup.freshnessHours',
          'backup.encryptionEnabled',
        ],
      }),
  })

  const [folder, setFolder] = useState('')
  const [secondary, setSecondary] = useState('')
  const [onExit, setOnExit] = useState(true)
  const [daily, setDaily] = useState(true)
  const [weekly, setWeekly] = useState(true)
  const [keepDaily, setKeepDaily] = useState(14)
  const [keepWeekly, setKeepWeekly] = useState(8)
  const [freshnessHours, setFreshnessHours] = useState(24)
  const [encryptionEnabled, setEncryptionEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [passwordAck, setPasswordAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [restorePath, setRestorePath] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [inspectInfo, setInspectInfo] = useState<string | null>(null)
  const [readonlyStaging, setReadonlyStaging] = useState<{
    stagingDir: string
    dbPath: string
    rowCounts: Record<string, number>
    appVersion: string
    schemaVersion: number
  } | null>(null)
  const readonlyStagingDirRef = useRef<string | null>(null)

  useEffect(() => {
    const v = settingsQuery.data?.values
    if (!v) return
    setFolder(String(v['backup.folder'] ?? ''))
    setSecondary(String(v['backup.secondaryFolder'] ?? ''))
    setOnExit(Boolean(v['backup.onExit']))
    setDaily(Boolean(v['backup.daily']))
    setWeekly(Boolean(v['backup.weekly']))
    setKeepDaily(Number(v['backup.keepDaily'] ?? 14))
    setKeepWeekly(Number(v['backup.keepWeekly'] ?? 8))
    setFreshnessHours(Number(v['backup.freshnessHours'] ?? 24))
    setEncryptionEnabled(Boolean(v['backup.encryptionEnabled']))
  }, [settingsQuery.data])

  useEffect(() => {
    return window.api.on('backup:progress', (payload) => {
      const p = payload as { message?: string; percent?: number }
      setProgress(`${p.percent ?? 0}% — ${p.message ?? ''}`)
    })
  }, [])

  // Close read-only extract on unmount / navigate away (best-effort).
  useEffect(() => {
    return () => {
      const stagingDir = readonlyStagingDirRef.current
      if (!stagingDir) return
      readonlyStagingDirRef.current = null
      void api.backup.closeReadonly(stagingDir).catch(() => {
        // ignore cleanup failures
      })
    }
  }, [])

  async function saveSettings() {
    try {
      if (encryptionEnabled) {
        if (!passwordAck) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Confirm that a lost encryption password means unrecoverable backups',
          )
        }
        if (password && password !== password2) {
          throw new AppError('VALIDATION_FAILED', 'Passwords do not match')
        }
      }
      if (encryptionEnabled && password) {
        await api.backup.setEncryptionPassword(password)
      }
      if (!encryptionEnabled) {
        await api.backup.setEncryptionPassword(null)
      }
      await api.settings.setMany({
        values: {
          'backup.folder': folder,
          'backup.secondaryFolder': secondary,
          'backup.onExit': onExit,
          'backup.daily': daily,
          'backup.weekly': weekly,
          'backup.keepDaily': keepDaily,
          'backup.keepWeekly': keepWeekly,
          'backup.freshnessHours': freshnessHours,
          'backup.encryptionEnabled': encryptionEnabled,
        },
      })
      await qc.invalidateQueries({ queryKey: ['settings'] })
      await qc.invalidateQueries({ queryKey: ['backup'] })
      toast({
        title: 'Backup settings saved',
        description:
          encryptionEnabled && !password && !statusQuery.data?.hasSessionEncryptionPassword
            ? 'Encryption is on — enter the password (and Backup now or Save again) so scheduled backups can encrypt.'
            : undefined,
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function backupNow() {
    setBusy(true)
    setProgress('Starting…')
    try {
      if (encryptionEnabled) {
        if (!password || password !== password2) {
          throw new AppError('VALIDATION_FAILED', 'Enter matching encryption passwords')
        }
        if (!passwordAck) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Confirm that a lost password means unrecoverable backups',
          )
        }
      }
      if (encryptionEnabled && password) {
        await api.backup.setEncryptionPassword(password)
      }
      const result = await api.backup.create('manual', encryptionEnabled ? password : undefined)
      toast({
        title: 'Backup created',
        description: result.secondaryWarning
          ? `Saved, but secondary copy failed: ${result.secondaryWarning}`
          : result.filePath,
        variant: result.secondaryWarning ? 'error' : 'success',
      })
      await qc.invalidateQueries({ queryKey: ['backup'] })
    } catch (err) {
      toast({
        title: 'Backup failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  async function pickRestoreFile() {
    const picked = await api.dialog.pickFile({
      title: 'Choose backup archive',
      filters: [
        { name: 'Aqua Nuqi backup', extensions: ['zip', 'db', 'sqlite'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (picked.path) setRestorePath(picked.path)
  }

  async function inspectSelected() {
    try {
      const info = await api.backup.inspect(restorePath, restorePassword || undefined)
      const counts = Object.entries(info.manifest.rowCounts)
        .slice(0, 8)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      setInspectInfo(
        `${info.validChecksum ? 'Valid' : 'CHECKSUM MISMATCH'} · app ${info.manifest.appVersion} · schema ${info.manifest.schemaVersion} · ${info.manifest.attachmentFileCount} attachment files · ${counts}`,
      )
    } catch (err) {
      toast({
        title: 'Inspect failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function restoreSelected() {
    if (restoreConfirm !== 'RESTORE') {
      toast({ title: 'Type RESTORE to confirm', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const result = await api.backup.restore(restorePath, 'RESTORE', restorePassword || undefined)
      toast({
        title: 'Restore started',
        description: `Safety backup at ${result.preRestorePath}. App will restart.`,
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Restore failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function openReadonly() {
    try {
      if (readonlyStaging) {
        await api.backup.closeReadonly(readonlyStaging.stagingDir)
        readonlyStagingDirRef.current = null
        setReadonlyStaging(null)
      }
      const result = await api.backup.openReadonly(restorePath, restorePassword || undefined)
      readonlyStagingDirRef.current = result.stagingDir
      setReadonlyStaging({
        stagingDir: result.stagingDir,
        dbPath: result.dbPath,
        rowCounts: result.manifest.rowCounts,
        appVersion: result.manifest.appVersion,
        schemaVersion: result.manifest.schemaVersion,
      })
      setInspectInfo(null)
    } catch (err) {
      toast({
        title: 'Open failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function closeReadonlyView() {
    if (!readonlyStaging) return
    const stagingDir = readonlyStaging.stagingDir
    try {
      await api.backup.closeReadonly(stagingDir)
    } catch {
      // best-effort cleanup
    }
    readonlyStagingDirRef.current = null
    setReadonlyStaging(null)
  }

  const status = statusQuery.data
  const stale = status?.isStale ?? true

  return (
    <div className="space-y-6">
      <div
        className={`rounded-lg border px-4 py-3 ${stale ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}
      >
        <div className="text-lg font-semibold">
          {status?.lastSuccessAt ? (
            <>
              Last backup: <DateText value={status.lastSuccessAt} kind="datetime" />
            </>
          ) : (
            'No successful backup yet'
          )}
        </div>
        <p className="text-sm opacity-80">
          Freshness window: {status?.freshnessHours ?? 24}h · Storage used:{' '}
          {formatBytes(status?.storageUsedBytes ?? 0)}
          {status?.isPortable ? ' · Portable data folder (not shared with installed app)' : ''}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Primary backup folder</Label>
          <div className="flex gap-2">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const p = await api.dialog.pickFolder({ title: 'Backup folder' })
                if (p.path) setFolder(p.path)
              }}
            >
              Browse
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Secondary folder (optional USB / Drive sync)</Label>
          <div className="flex gap-2">
            <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const p = await api.dialog.pickFolder({ title: 'Secondary backup folder' })
                if (p.path) setSecondary(p.path)
              }}
            >
              Browse
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onExit} onChange={(e) => setOnExit(e.target.checked)} />
          Backup on exit
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          Daily
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          Weekly
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Keep daily</Label>
          <Input
            type="number"
            value={keepDaily}
            onChange={(e) => setKeepDaily(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Keep weekly</Label>
          <Input
            type="number"
            value={keepWeekly}
            onChange={(e) => setKeepWeekly(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Freshness hours</Label>
          <Input
            type="number"
            value={freshnessHours}
            onChange={(e) => setFreshnessHours(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={encryptionEnabled}
            onChange={(e) => setEncryptionEnabled(e.target.checked)}
          />
          Password-protect backups (AES)
        </label>
        {encryptionEnabled ? (
          <>
            <p className="text-sm text-amber-900">
              If you lose this password, these backups cannot be restored. Store it somewhere safe.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={passwordAck}
                onChange={(e) => setPasswordAck(e.target.checked)}
              />
              I understand a lost password means unrecoverable backups
            </label>
            <p className="text-xs text-amber-900">
              Scheduled and exit backups use this password for the current app session only (not
              saved to disk).
              {statusQuery.data?.hasSessionEncryptionPassword
                ? ' Session password is set.'
                : ' Enter the password and Save or Backup now before relying on schedules.'}
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveSettings()}>Save settings</Button>
        <Button data-testid="backup-now" onClick={() => void backupNow()} disabled={busy}>
          Backup now
        </Button>
        <Button variant="outline" onClick={() => void api.backup.openFolder()}>
          Open folder
        </Button>
      </div>
      {progress ? <p className="text-sm text-slate-600">{progress}</p> : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Backup history</h3>
        <div className="max-h-64 overflow-auto rounded border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Kind</th>
                <th className="p-2">Size</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(listQuery.data?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">
                    <DateText value={item.createdAt} kind="datetime" />
                  </td>
                  <td className="p-2">{item.kind}</td>
                  <td className="p-2 tabular-nums">
                    {item.sizeBytes != null ? formatBytes(item.sizeBytes) : '—'}
                  </td>
                  <td className="p-2">
                    {item.status}
                    {!item.exists ? ' (missing)' : ''}
                  </td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!item.exists || item.status !== 'success'}
                      onClick={async () => {
                        try {
                          const r = await api.backup.verify(item.filePath)
                          toast({
                            title: r.ok ? 'Backup valid' : 'Backup invalid',
                            description: r.message,
                            variant: r.ok ? 'success' : 'error',
                          })
                        } catch (err) {
                          toast({
                            title: 'Verify failed',
                            description: err instanceof AppError ? err.message : 'Error',
                            variant: 'error',
                          })
                        }
                      }}
                    >
                      Verify
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-red-200 p-4">
        <h3 className="font-semibold text-red-900">Restore</h3>
        <p className="text-sm text-slate-600">
          Restoring replaces your current data after taking a safety snapshot. Type RESTORE to
          confirm. The app will restart.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-[240px] flex-1"
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
            placeholder="Backup .zip path"
          />
          <Button variant="outline" onClick={() => void pickRestoreFile()}>
            Choose file
          </Button>
        </div>
        <Input
          type="password"
          placeholder="Password (if encrypted)"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
        />
        <Input
          value={restoreConfirm}
          onChange={(e) => setRestoreConfirm(e.target.value)}
          placeholder="Type RESTORE"
        />
        {inspectInfo ? <p className="text-sm text-slate-700">{inspectInfo}</p> : null}
        {readonlyStaging ? (
          <div className="space-y-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm">
            <p className="font-medium text-sky-950">
              Read-only extract (paths + row counts; live data untouched)
            </p>
            <p className="text-xs text-sky-900">
              This opens the backup database file for inspection tools — it is not an in-app
              historical query screen (e.g. “what was this balance in March”). Prefer a copy of the
              portable app against this extract, or restore only when you intend to replace live
              data.
            </p>
            <p>
              App {readonlyStaging.appVersion} · schema {readonlyStaging.schemaVersion}
            </p>
            <p className="font-mono text-xs break-all">DB: {readonlyStaging.dbPath}</p>
            <ul className="grid max-h-40 grid-cols-2 gap-x-3 overflow-auto text-xs">
              {Object.entries(readonlyStaging.rowCounts).map(([table, count]) => (
                <li key={table}>
                  {table}: {count}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => void closeReadonlyView()}>
              Close inspection
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void inspectSelected()} disabled={!restorePath}>
            Validate / preview
          </Button>
          <Button variant="outline" onClick={() => void openReadonly()} disabled={!restorePath}>
            Open read-only extract
          </Button>
          <Button
            variant="destructive"
            onClick={() => void restoreSelected()}
            disabled={busy || !restorePath || restoreConfirm !== 'RESTORE'}
          >
            Restore now
          </Button>
        </div>
      </div>
    </div>
  )
}
