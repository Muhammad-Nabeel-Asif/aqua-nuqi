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
  })
  const [newUser, setNewUser] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'operator' as 'owner' | 'operator' | 'viewer',
  })
  const [period, setPeriod] = useState('2026-06')
  const [reopenReason, setReopenReason] = useState('')

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
    setLocale({
      currencySymbol: String(v['locale.currencySymbol'] ?? 'Rs'),
      dateFormat: String(v['locale.dateFormat'] ?? 'dd-MM-yyyy'),
      decimalPlaces: Number(v['locale.decimalPlaces'] ?? 0),
    })
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
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business profile, users and system information." />
      <Tabs defaultValue="business">
        <TabsList>
          <TabsTrigger value="business">Business profile</TabsTrigger>
          <TabsTrigger value="locale">Localisation</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invoice" disabled>
            Invoice
          </TabsTrigger>
          <TabsTrigger value="backup" disabled>
            Backup
          </TabsTrigger>
          <TabsTrigger value="master" disabled>
            Master data
          </TabsTrigger>
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
          <Button onClick={() => void saveLocale()}>Save</Button>
        </TabsContent>

        <TabsContent value="users" className="max-w-2xl space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Existing users</h3>
            <ul className="mt-3 divide-y text-sm">
              {(usersQuery.data?.items ?? []).map((u) => (
                <li key={u.id} className="flex justify-between py-2">
                  <span>
                    {u.displayName} <span className="text-muted-foreground">(@{u.username})</span>
                  </span>
                  <span className="capitalize text-muted-foreground">{u.role}</span>
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
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
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
