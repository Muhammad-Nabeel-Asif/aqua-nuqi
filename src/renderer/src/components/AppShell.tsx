import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  Truck,
  Users,
  Wallet,
  ChartColumn,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { cn } from '@renderer/lib/utils'
import { useSessionStore } from '@renderer/stores/session'
import { useUiStore } from '@renderer/stores/ui'
import { CommandPalette } from './CommandPalette'
import { LockOverlay } from './LockOverlay'
import { Button } from './ui/button'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: Array<'owner' | 'operator' | 'viewer'>
  phase?: number
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: t('nav.dashboard'),
    icon: LayoutDashboard,
    roles: ['owner', 'operator', 'viewer'],
  },
  {
    to: '/deliveries/daily',
    label: t('nav.deliveries'),
    icon: Truck,
    roles: ['owner', 'operator', 'viewer'],
    phase: 2,
  },
  {
    to: '/customers',
    label: t('nav.customers'),
    icon: Users,
    roles: ['owner', 'operator', 'viewer'],
    phase: 1,
  },
  {
    to: '/billing/invoices',
    label: t('nav.billing'),
    icon: FileText,
    roles: ['owner', 'operator', 'viewer'],
    phase: 3,
  },
  {
    to: '/payments',
    label: t('nav.payments'),
    icon: Wallet,
    roles: ['owner', 'operator'],
    phase: 3,
  },
  {
    to: '/receivables',
    label: t('nav.receivables'),
    icon: ClipboardList,
    roles: ['owner', 'operator', 'viewer'],
    phase: 3,
  },
  { to: '/expenses', label: t('nav.expenses'), icon: Receipt, roles: ['owner'], phase: 5 },
  { to: '/employees', label: t('nav.employees'), icon: Users, roles: ['owner'], phase: 6 },
  {
    to: '/inventory',
    label: t('nav.inventory'),
    icon: Boxes,
    roles: ['owner', 'operator'],
    phase: 7,
  },
  { to: '/reports', label: t('nav.reports'), icon: ChartColumn, roles: ['owner'], phase: 8 },
  { to: '/settings', label: t('nav.settings'), icon: Settings, roles: ['owner'] },
]

export function AppShell() {
  const user = useSessionStore((s) => s.user)
  const locked = useSessionStore((s) => s.locked)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setCommandOpen = useUiStore((s) => s.setCommandOpen)
  const navigate = useNavigate()
  const [idleMs, setIdleMs] = useState(0)

  const backupQuery = useQuery({
    queryKey: ['backup', 'list'],
    queryFn: () => api.backup.list(),
    enabled: user?.role === 'owner',
    refetchInterval: 60_000,
  })

  const settingsQuery = useQuery({
    queryKey: ['settings', 'security'],
    queryFn: () => api.settings.get({ keys: ['security.autoLockMinutes'] }),
    enabled: Boolean(user),
  })

  const autoLockMinutes =
    (settingsQuery.data?.values['security.autoLockMinutes'] as number | undefined) ?? 15

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  useEffect(() => {
    if (!user || locked) return
    let last = Date.now()
    const bump = () => {
      last = Date.now()
      setIdleMs(0)
    }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const
    events.forEach((ev) => window.addEventListener(ev, bump))
    const timer = window.setInterval(() => {
      const idle = Date.now() - last
      setIdleMs(idle)
      if (idle >= autoLockMinutes * 60_000) {
        void api.auth.lock().then(() => {
          useSessionStore.getState().setSession({
            user,
            locked: true,
            setupRequired: false,
          })
        })
      }
    }, 1000)
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump))
      window.clearInterval(timer)
    }
  }, [user, locked, autoLockMinutes])

  const items = useMemo(() => NAV.filter((n) => user && n.roles.includes(user.role)), [user])

  const backupChip = useMemo(() => {
    const last = backupQuery.data?.lastSuccessAt
    if (!last) return { label: 'No backup yet', tone: 'danger' as const }
    const ageH = (Date.now() - new Date(last).getTime()) / 3_600_000
    if (ageH < 24)
      return { label: `Backed up ${Math.max(1, Math.round(ageH))}h ago`, tone: 'ok' as const }
    const days = Math.round(ageH / 24)
    return { label: `No backup for ${days} day${days === 1 ? '' : 's'}`, tone: 'danger' as const }
  }, [backupQuery.data])

  async function logout() {
    await api.auth.logout()
    useSessionStore.getState().setSession({ user: null, locked: false, setupRequired: false })
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-sky-100 bg-white/80 backdrop-blur transition-all',
          collapsed ? 'w-[68px]' : 'w-56',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <Package className="h-5 w-5 text-primary" />
          {!collapsed ? (
            <span className="text-sm font-bold tracking-tight text-sky-900">{t('app.name')}</span>
          ) : null}
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-sky-50 hover:text-sky-900',
                  isActive && 'bg-sky-100 text-sky-900',
                )
              }
              title={item.label}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-sky-100 bg-white/70 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <Menu className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 min-w-[220px] items-center gap-2 rounded-md border bg-white px-3 text-sm text-muted-foreground hover:bg-slate-50"
          >
            <Search className="h-4 w-4" />
            Search… <kbd className="ml-auto text-[10px]">Ctrl+K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="tabular-nums text-muted-foreground">
              {format(new Date(), 'dd MMM yyyy')}
            </span>
            {user?.role === 'owner' ? (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  backupChip.tone === 'ok'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700',
                )}
              >
                {backupChip.label}
              </span>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="font-medium">{user?.displayName}</span>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                {t('action.logout')}
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette items={items.map((i) => ({ to: i.to, label: i.label }))} />
      {locked ? <LockOverlay /> : null}
      {/* keep idle tracker referenced to avoid unused lint in future */}
      <span className="hidden">{idleMs}</span>
    </div>
  )
}
