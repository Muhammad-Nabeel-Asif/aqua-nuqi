import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { DateText } from '@renderer/components/DateText'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { api } from '@renderer/lib/api'
import { useSessionStore } from '@renderer/stores/session'
import { AppError } from '@shared/errors'
import { AuditPanel } from './AuditPanel'
import { BackupPanel } from './BackupPanel'
import { InvoiceSettingsPanel } from './InvoiceSettingsPanel'
import { MaintenancePanel } from './MaintenancePanel'
import { MasterDataPanel } from './MasterDataPanel'

export function SettingsPage() {
  const user = useSessionStore((s) => s.user)
  const qc = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => api.settings.get(),
  })

  const aboutQuery = useQuery({
    queryKey: ['about'],
    queryFn: () => api.about.get(),
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.auth.listUsers(),
    enabled: user?.role === 'owner',
  })

  const [business, setBusiness] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    bankDetails: '',
  })
  const [locale, setLocale] = useState({
    currencySymbol: 'Rs',
    dateFormat: 'dd-MM-yyyy',
    decimalPlaces: 0,
    workingDaysBasis: 'fixed_26' as 'calendar' | 'fixed_26' | 'working_days',
  })
  const [newUser, setNewUser] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'operator' as 'owner' | 'operator' | 'viewer',
  })
  const [passwordStrength, setPasswordStrength] = useState('')
  const [autoLockMinutes, setAutoLockMinutes] = useState(15)
  const [lockOnMinimise, setLockOnMinimise] = useState(false)
  const [autoUpdates, setAutoUpdates] = useState(true)
  const [recoveryShown, setRecoveryShown] = useState<string | null>(null)
  const [period, setPeriod] = useState('2026-06')
  const [reopenReason, setReopenReason] = useState('')
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash
    if (hash.includes('/settings/backup')) return 'backup'
    if (hash.includes('/settings/audit')) return 'audit'
    return 'business'
  })

  useEffect(() => {
    const v = settingsQuery.data?.values
    if (!v) return
    setBusiness({
      name: String(v['business.name'] ?? ''),
      address: String(v['business.address'] ?? ''),
      phone: String(v['business.phone'] ?? ''),
      email: String(v['business.email'] ?? ''),
      bankDetails: String(v['business.bankDetails'] ?? ''),
    })
    const basis = String(v['payroll.workingDaysBasis'] ?? 'fixed_26')
    setLocale({
      currencySymbol: String(v['locale.currencySymbol'] ?? 'Rs'),
      dateFormat: String(v['locale.dateFormat'] ?? 'dd-MM-yyyy'),
      decimalPlaces: Number(v['locale.decimalPlaces'] ?? 0),
      workingDaysBasis:
        basis === 'calendar' || basis === 'working_days' || basis === 'fixed_26'
          ? basis
          : 'fixed_26',
    })
    setAutoLockMinutes(Number(v['security.autoLockMinutes'] ?? 15))
    setLockOnMinimise(Boolean(v['security.lockOnMinimise']))
    setAutoUpdates(Boolean(v['updates.automatic'] ?? true))
  }, [settingsQuery.data])

  async function saveBusiness() {
    try {
      await api.settings.setMany({
        values: {
          'business.name': business.name,
          'business.address': business.address,
          'business.phone': business.phone,
          'business.email': business.email,
          'business.bankDetails': business.bankDetails,
        },
      })
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'Business profile saved', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    }
  }

  async function saveLocale() {
    try {
      await api.settings.setMany({
        values: {
          'locale.currencySymbol': locale.currencySymbol,
          'locale.dateFormat': locale.dateFormat,
          'locale.decimalPlaces': locale.decimalPlaces,
          'payroll.workingDaysBasis': locale.workingDaysBasis,
        },
      })
      toast({ title: 'Localisation saved', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    }
  }

  async function createUser() {
    try {
      await api.auth.createUser(newUser)
      setNewUser({ username: '', displayName: '', password: '', role: 'operator' })
      await qc.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'User created', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Could not create user',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    }
  }

  async function exportDiagnostics() {
    const folder = await api.dialog.pickFolder({ title: 'Save diagnostics to…' })
    if (!folder.path) return
    try {
      const res = await api.diagnostics.export(folder.path)
      toast({ title: 'Diagnostics exported', description: res.zipPath, variant: 'success' })
      await api.shell.openPath(folder.path)
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function reportProblem() {
    const folder = await api.dialog.pickFolder({ title: 'Save problem report to…' })
    if (!folder.path) return
    try {
      const res = await api.diagnostics.reportProblem(folder.path)
      toast({
        title: 'Problem report ready',
        description: res.zipPath,
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Report failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business profile, backup, users and maintenance." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="locale">Localisation</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="master">Master data</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="users">Users & security</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="max-w-xl space-y-3">
          <Field
            label="Business name"
            value={business.name}
            onChange={(v) => setBusiness({ ...business, name: v })}
          />
          <Field
            label="Address"
            value={business.address}
            onChange={(v) => setBusiness({ ...business, address: v })}
          />
          <Field
            label="Phone"
            value={business.phone}
            onChange={(v) => setBusiness({ ...business, phone: v })}
          />
          <Field
            label="Email"
            value={business.email}
            onChange={(v) => setBusiness({ ...business, email: v })}
          />
          <Field
            label="Bank details"
            value={business.bankDetails}
            onChange={(v) => setBusiness({ ...business, bankDetails: v })}
          />
          <Button onClick={() => void saveBusiness()}>Save</Button>
        </TabsContent>

        <TabsContent value="invoice">
          <InvoiceSettingsPanel />
        </TabsContent>

        <TabsContent value="billing" className="max-w-xl space-y-3">
          <p className="text-sm text-slate-600">
            Default billing day of month and tax settings. Tax is off by default.
          </p>
          <Field
            label="Default billing day (1–28)"
            value={String(settingsQuery.data?.values['billing.defaultBillingDay'] ?? 1)}
            onChange={async (v) => {
              await api.settings.setMany({
                values: { 'billing.defaultBillingDay': Number(v) || 1 },
              })
              await qc.invalidateQueries({ queryKey: ['settings'] })
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settingsQuery.data?.values['tax.enabled'])}
              onChange={async (e) => {
                await api.settings.setMany({ values: { 'tax.enabled': e.target.checked } })
                await qc.invalidateQueries({ queryKey: ['settings'] })
              }}
            />
            Enable tax / GST on invoices
          </label>
          <Field
            label="Tax / GST rate (percent, e.g. 17 for 17%)"
            value={String(settingsQuery.data?.values['tax.rate'] ?? 0)}
            onChange={async (v) => {
              const rate = Number(v)
              if (!Number.isFinite(rate) || rate < 0) {
                toast({ title: 'Enter a non-negative tax rate', variant: 'error' })
                return
              }
              await api.settings.setMany({ values: { 'tax.rate': rate } })
              await qc.invalidateQueries({ queryKey: ['settings'] })
            }}
          />
        </TabsContent>

        <TabsContent value="master">
          <MasterDataPanel />
        </TabsContent>

        <TabsContent value="backup">
          <BackupPanel />
        </TabsContent>

        <TabsContent value="maintenance">
          <MaintenancePanel />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>

        <TabsContent value="locale" className="max-w-xl space-y-3">
          <Field
            label="Currency symbol"
            value={locale.currencySymbol}
            onChange={(v) => setLocale({ ...locale, currencySymbol: v })}
          />
          <Field
            label="Date format"
            value={locale.dateFormat}
            onChange={(v) => setLocale({ ...locale, dateFormat: v })}
          />
          <div className="space-y-1.5">
            <Label>Decimal places</Label>
            <Input
              type="number"
              min={0}
              max={2}
              value={locale.decimalPlaces}
              onChange={(e) => setLocale({ ...locale, decimalPlaces: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payroll working-days basis</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={locale.workingDaysBasis}
              onChange={(e) =>
                setLocale({
                  ...locale,
                  workingDaysBasis: e.target.value as 'calendar' | 'fixed_26' | 'working_days',
                })
              }
            >
              <option value="fixed_26">Fixed 26 days (default)</option>
              <option value="calendar">Calendar days in month</option>
              <option value="working_days">Actual working days (excl. holidays)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Used for absence deductions. Also shown on the payroll screen.
            </p>
          </div>
          <Button onClick={() => void saveLocale()}>Save</Button>
        </TabsContent>

        <TabsContent value="users" className="max-w-2xl space-y-4">
          <div className="space-y-3 rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Security</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Auto-lock minutes</Label>
                <Input
                  type="number"
                  min={0}
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(Number(e.target.value) || 0)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input
                  type="checkbox"
                  checked={lockOnMinimise}
                  onChange={(e) => setLockOnMinimise(e.target.checked)}
                />
                Lock when window is minimised
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoUpdates}
                onChange={(e) => setAutoUpdates(e.target.checked)}
              />
              Automatic updates (stable channel only)
            </label>
            <Button
              onClick={async () => {
                await api.settings.setMany({
                  values: {
                    'security.autoLockMinutes': autoLockMinutes,
                    'security.lockOnMinimise': lockOnMinimise,
                    'updates.automatic': autoUpdates,
                  },
                })
                toast({ title: 'Security settings saved', variant: 'success' })
              }}
            >
              Save security settings
            </Button>
            <div className="border-t pt-3">
              <Button
                variant="outline"
                onClick={async () => {
                  const r = await api.auth.generateRecoveryCode()
                  setRecoveryShown(r.recoveryCode)
                  toast({
                    title: 'Recovery code generated — copy it now',
                    description: 'It will not be shown again.',
                    variant: 'success',
                  })
                }}
              >
                Generate recovery code
              </Button>
              {recoveryShown ? (
                <p className="mt-2 rounded bg-amber-50 p-2 font-mono text-sm">{recoveryShown}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Without a recovery code, the only way to recover a lost owner password is a backup.
              </p>
            </div>
            <div className="border-t pt-3">
              <Button
                variant="outline"
                onClick={async () => {
                  const status = (await api.updates.check()) as {
                    updateAvailable?: boolean
                    availableVersion?: string | null
                    lastError?: string | null
                  }
                  if (status.lastError) {
                    toast({
                      title: 'Update check',
                      description: status.lastError,
                      variant: 'error',
                    })
                  } else if (status.updateAvailable) {
                    toast({
                      title: `Update ${status.availableVersion} available`,
                      description:
                        'It downloads in the background. Use Restart & install when ready — a backup runs first.',
                      variant: 'success',
                    })
                  } else {
                    toast({ title: 'You are on the latest stable version', variant: 'success' })
                  }
                }}
              >
                Check for updates
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Existing users</h3>
            <ul className="mt-3 divide-y text-sm">
              {(usersQuery.data?.items ?? []).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {u.displayName}{' '}
                    <span className="text-muted-foreground">
                      (@{u.username}) · {u.role}
                      {!u.isActive ? ' · inactive' : ''}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await api.auth.setUserActive({ userId: u.id, isActive: !u.isActive })
                        await qc.invalidateQueries({ queryKey: ['users'] })
                      }}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const pwd = window.prompt('New password (min 8 characters)')
                        if (!pwd) return
                        await api.auth.resetPassword({ userId: u.id, newPassword: pwd })
                        toast({ title: 'Password reset', variant: 'success' })
                      }}
                    >
                      Reset password
                    </Button>
                    {u.hasPin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await api.auth.clearPin({ userId: u.id })
                          await qc.invalidateQueries({ queryKey: ['users'] })
                        }}
                      >
                        Clear PIN
                      </Button>
                    ) : user?.id === u.id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const pin = window.prompt('New 4–6 digit PIN')
                          const pwd = window.prompt('Your password to confirm')
                          if (!pin || !pwd) return
                          await api.auth.setPin({ pin, password: pwd })
                          await qc.invalidateQueries({ queryKey: ['users'] })
                          toast({ title: 'PIN set', variant: 'success' })
                        }}
                      >
                        Set PIN
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const name = window.prompt('Display name', u.displayName)
                        if (!name) return
                        await api.auth.updateUser({ userId: u.id, displayName: name })
                        await qc.invalidateQueries({ queryKey: ['users'] })
                        toast({ title: 'User updated', variant: 'success' })
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await api.auth.forceLogout({ userId: u.id })
                        toast({ title: 'Force logout recorded', variant: 'success' })
                        await qc.invalidateQueries({ queryKey: ['users'] })
                      }}
                    >
                      Force logout
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Create user</h3>
            <Field
              label="Username"
              value={newUser.username}
              onChange={(v) => setNewUser({ ...newUser, username: v })}
            />
            <Field
              label="Display name"
              value={newUser.displayName}
              onChange={(v) => setNewUser({ ...newUser, displayName: v })}
            />
            <div className="space-y-1.5">
              <Label>Password (min 8)</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => {
                  const password = e.target.value
                  setNewUser({ ...newUser, password })
                  void api.auth.passwordStrength(password).then((r) => setPasswordStrength(r.label))
                }}
              />
              {passwordStrength ? (
                <p className="text-xs text-muted-foreground">Strength: {passwordStrength}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                className="flex h-9 w-full rounded-md border px-3 text-sm"
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({
                    ...newUser,
                    role: e.target.value as 'owner' | 'operator' | 'viewer',
                  })
                }
              >
                <option value="owner">Owner</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <Button onClick={() => void createUser()}>Create user</Button>
          </div>
        </TabsContent>

        <TabsContent value="about" className="max-w-2xl space-y-4">
          <div className="rounded-lg border bg-white p-4 text-sm">
            <dl className="grid grid-cols-[160px_1fr] gap-2">
              <dt className="text-muted-foreground">App version</dt>
              <dd>{aboutQuery.data?.appVersion}</dd>
              <dt className="text-muted-foreground">Schema version</dt>
              <dd>{aboutQuery.data?.schemaVersion}</dd>
              <dt className="text-muted-foreground">Database path</dt>
              <dd className="break-all font-mono text-xs">{aboutQuery.data?.dbPath}</dd>
              <dt className="text-muted-foreground">Database size</dt>
              <dd>
                {aboutQuery.data ? `${(aboutQuery.data.dbSizeBytes / 1024).toFixed(1)} KB` : '—'}
              </dd>
            </dl>
            <Button className="mt-4" variant="secondary" onClick={() => void exportDiagnostics()}>
              Export diagnostics
            </Button>
            <Button className="ml-2 mt-4" variant="outline" onClick={() => void reportProblem()}>
              Report a problem
            </Button>
            {user?.role === 'owner' ? (
              <Button
                className="ml-2 mt-4"
                variant="outline"
                onClick={() =>
                  void api.balances
                    .recalculate()
                    .then((r) =>
                      toast({ title: `Recalculated ${r.updated} balances`, variant: 'success' }),
                    )
                    .catch((err: unknown) =>
                      toast({
                        title: 'Recalculation failed',
                        description: err instanceof AppError ? err.message : 'Error',
                        variant: 'error',
                      }),
                    )
                }
              >
                Recalculate balances
              </Button>
            ) : null}
            {import.meta.env.DEV ? (
              <Button
                className="ml-2 mt-4"
                variant="outline"
                onClick={() =>
                  void api.dev?.seedDemo().then((r) =>
                    toast({
                      title: `Seeded ${r.customers} customers, ${r.areas} areas, ${r.routes} routes`,
                      variant: 'success',
                    }),
                  )
                }
              >
                Seed demo customers
              </Button>
            ) : null}
          </div>

          {user?.role === 'owner' ? (
            <div className="rounded-lg border bg-white p-4">
              <h3 className="font-semibold">Period lock (owner)</h3>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>Period (YYYY-MM)</Label>
                  <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                <Button
                  onClick={() =>
                    void api.period
                      .close(period)
                      .then(() => toast({ title: `Closed ${period}`, variant: 'success' }))
                      .catch((err: unknown) =>
                        toast({
                          title: 'Close failed',
                          description: err instanceof AppError ? err.message : 'Error',
                          variant: 'error',
                          code: err instanceof AppError ? err.code : undefined,
                        }),
                      )
                  }
                >
                  Close period
                </Button>
                <div className="space-y-1.5">
                  <Label>Reopen reason</Label>
                  <Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    void api.period
                      .reopen(period, reopenReason || 'No reason')
                      .then(() => toast({ title: `Reopened ${period}`, variant: 'success' }))
                      .catch((err: unknown) =>
                        toast({
                          title: 'Reopen failed',
                          description: err instanceof AppError ? err.message : 'Error',
                          variant: 'error',
                          code: err instanceof AppError ? err.code : undefined,
                        }),
                      )
                  }
                >
                  Reopen period
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Recent audit entries</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(aboutQuery.data?.recentAudit ?? []).map((a) => (
                <li key={a.id} className="flex justify-between gap-4 border-b pb-2">
                  <span>{a.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <DateText value={a.occurredAt} kind="datetime" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
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
