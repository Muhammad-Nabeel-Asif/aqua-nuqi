import { Navigate, createHashRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { GenerateBillsPage } from './features/billing/GenerateBillsPage'
import { InvoiceDetailPage } from './features/billing/InvoiceDetailPage'
import { InvoiceListPage } from './features/billing/InvoiceListPage'
import { PeriodsPage } from './features/billing/PeriodsPage'
import { CustomerDetailPage } from './features/customers/CustomerDetailPage'
import { CustomersPage } from './features/customers/CustomersPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { BottlesOutPage } from './features/deliveries/BottlesOutPage'
import { CustomerCardPage } from './features/deliveries/CustomerCardPage'
import { DailyEntryPage } from './features/deliveries/DailyEntryPage'
import { MonthMatrixPage } from './features/deliveries/MonthMatrixPage'
import { AdvancesPage } from './features/employees/AdvancesPage'
import { AttendancePage } from './features/employees/AttendancePage'
import { EmployeeDetailPage } from './features/employees/EmployeeDetailPage'
import { EmployeesPage } from './features/employees/EmployeesPage'
import { PayrollPage } from './features/employees/PayrollPage'
import { ExpenseCategoriesPage } from './features/expenses/ExpenseCategoriesPage'
import { ExpensesPage } from './features/expenses/ExpensesPage'
import { InventoryBottlesOutPage } from './features/inventory/InventoryBottlesOutPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { TripsPage } from './features/inventory/TripsPage'
import { VehiclesPage } from './features/inventory/VehiclesPage'
import { PaymentsPage } from './features/payments/PaymentsPage'
import { ComingSoonPage } from './features/placeholder/ComingSoonPage'
import { ReceivablesPage } from './features/receivables/ReceivablesPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SetupWizard } from './features/setup/SetupWizard'
import { PrintJobPage } from './print/PrintJobPage'
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
    path: '/print/:template',
    element: <PrintJobPage />,
  },
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
      { path: 'deliveries/daily', element: <DailyEntryPage /> },
      { path: 'deliveries/matrix', element: <MonthMatrixPage /> },
      { path: 'deliveries/bottles-out', element: <BottlesOutPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'customers/:id/card/:period', element: <CustomerCardPage /> },
      { path: 'billing/generate', element: <GenerateBillsPage /> },
      { path: 'billing/invoices', element: <InvoiceListPage /> },
      { path: 'billing/invoices/:id', element: <InvoiceDetailPage /> },
      { path: 'billing/periods', element: <PeriodsPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'receivables', element: <ReceivablesPage /> },
      {
        path: 'expenses',
        element: (
          <RequireOwner>
            <ExpensesPage />
          </RequireOwner>
        ),
      },
      {
        path: 'expenses/categories',
        element: (
          <RequireOwner>
            <ExpenseCategoriesPage />
          </RequireOwner>
        ),
      },
      {
        path: 'employees',
        element: (
          <RequireOwner>
            <EmployeesPage />
          </RequireOwner>
        ),
      },
      {
        path: 'employees/attendance',
        element: (
          <RequireOwner>
            <AttendancePage />
          </RequireOwner>
        ),
      },
      {
        path: 'employees/advances',
        element: (
          <RequireOwner>
            <AdvancesPage />
          </RequireOwner>
        ),
      },
      {
        path: 'employees/:id',
        element: (
          <RequireOwner>
            <EmployeeDetailPage />
          </RequireOwner>
        ),
      },
      {
        path: 'payroll',
        element: (
          <RequireOwner>
            <PayrollPage />
          </RequireOwner>
        ),
      },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/vehicles', element: <VehiclesPage /> },
      { path: 'inventory/trips', element: <TripsPage /> },
      { path: 'inventory/bottles-out', element: <InventoryBottlesOutPage /> },
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
