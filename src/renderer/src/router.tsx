import { Navigate, createHashRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { CustomerDetailPage } from './features/customers/CustomerDetailPage'
import { CustomersPage } from './features/customers/CustomersPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ComingSoonPage } from './features/placeholder/ComingSoonPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SetupWizard } from './features/setup/SetupWizard'
import { useSessionStore } from './stores/session'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useSessionStore((s) => s.user)
  const setupRequired = useSessionStore((s) => s.setupRequired)
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSetup({ children }: { children: React.ReactNode }) {
  const setupRequired = useSessionStore((s) => s.setupRequired)
  if (!setupRequired) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireOwner({ children }: { children: React.ReactNode }) {
  const user = useSessionStore((s) => s.user)
  if (user?.role !== 'owner') return <Navigate to="/" replace />
  return <>{children}</>
}

export const router = createHashRouter([
  {
    path: '/setup',
    element: (
      <RequireSetup>
        <SetupWizard />
      </RequireSetup>
    ),
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'deliveries/daily', element: <ComingSoonPage title="Daily deliveries" phase={2} /> },
      { path: 'deliveries/matrix', element: <ComingSoonPage title="Month matrix" phase={2} /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'billing/generate', element: <ComingSoonPage title="Generate invoices" phase={3} /> },
      { path: 'billing/invoices', element: <ComingSoonPage title="Invoices" phase={3} /> },
      {
        path: 'billing/invoices/:id',
        element: <ComingSoonPage title="Invoice detail" phase={3} />,
      },
      { path: 'payments', element: <ComingSoonPage title="Payments" phase={3} /> },
      { path: 'receivables', element: <ComingSoonPage title="Receivables" phase={3} /> },
      { path: 'expenses', element: <ComingSoonPage title="Expenses" phase={5} /> },
      {
        path: 'expenses/categories',
        element: <ComingSoonPage title="Expense categories" phase={5} />,
      },
      { path: 'employees', element: <ComingSoonPage title="Employees" phase={6} /> },
      { path: 'employees/:id', element: <ComingSoonPage title="Employee detail" phase={6} /> },
      { path: 'employees/attendance', element: <ComingSoonPage title="Attendance" phase={6} /> },
      { path: 'payroll', element: <ComingSoonPage title="Payroll" phase={6} /> },
      { path: 'inventory', element: <ComingSoonPage title="Inventory" phase={7} /> },
      { path: 'inventory/trips', element: <ComingSoonPage title="Trips" phase={7} /> },
      { path: 'inventory/bottles-out', element: <ComingSoonPage title="Bottles out" phase={7} /> },
      { path: 'reports', element: <ComingSoonPage title="Reports" phase={8} /> },
      {
        path: 'settings',
        element: (
          <RequireOwner>
            <SettingsPage />
          </RequireOwner>
        ),
      },
      {
        path: 'settings/*',
        element: (
          <RequireOwner>
            <SettingsPage />
          </RequireOwner>
        ),
      },
    ],
  },
])
