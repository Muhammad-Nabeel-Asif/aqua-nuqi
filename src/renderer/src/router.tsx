import { createHashRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { NotFoundPage } from './components/NotFoundPage'
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
import { HelpPage } from './features/help/HelpPage'
import { InventoryBottlesOutPage } from './features/inventory/InventoryBottlesOutPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { TripsPage } from './features/inventory/TripsPage'
import { VehiclesPage } from './features/inventory/VehiclesPage'
import { PaymentsPage } from './features/payments/PaymentsPage'
import { ReceivablesPage } from './features/receivables/ReceivablesPage'
import { AreaRoutePerformancePage } from './features/reports/AreaRoutePerformancePage'
import { BottleLossReportPage } from './features/reports/BottleLossReportPage'
import { CollectionReportPage } from './features/reports/CollectionReportPage'
import { CostPerBottlePage } from './features/reports/CostPerBottlePage'
import { CustomerActivityPage } from './features/reports/CustomerActivityPage'
import { CustomerSalesPage } from './features/reports/CustomerSalesPage'
import { CustomerStatementsPage } from './features/reports/CustomerStatementsPage'
import { EmployeeDeliveryReportPage } from './features/reports/EmployeeDeliveryReportPage'
import { ExpenseReportPage } from './features/reports/ExpenseReportPage'
import { ProfitLossPage } from './features/reports/ProfitLossPage'
import { ReceivablesAgeingReportPage } from './features/reports/ReceivablesAgeingReportPage'
import { ReportsHubPage } from './features/reports/ReportsHubPage'
import { SalesSummaryPage } from './features/reports/SalesSummaryPage'
import { StockMovementRegisterPage } from './features/reports/StockMovementRegisterPage'
import { TripVarianceReportPage } from './features/reports/TripVarianceReportPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SetupWizard } from './features/setup/SetupWizard'
import { PrintJobPage } from './print/PrintJobPage'
import { RequireAuth, RequireOwner, RequireSetup } from './route-guards'

export { RequireAuth, RequireOwner, RequireSetup } from './route-guards'

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
      { path: 'reports', element: <ReportsHubPage /> },
      { path: 'reports/sales-summary', element: <SalesSummaryPage /> },
      { path: 'reports/customer-sales', element: <CustomerSalesPage /> },
      { path: 'reports/area-route-performance', element: <AreaRoutePerformancePage /> },
      { path: 'reports/employee-delivery', element: <EmployeeDeliveryReportPage /> },
      { path: 'reports/customer-activity', element: <CustomerActivityPage /> },
      { path: 'reports/bottle-loss', element: <BottleLossReportPage /> },
      { path: 'reports/trip-variance', element: <TripVarianceReportPage /> },
      { path: 'reports/stock-movements', element: <StockMovementRegisterPage /> },
      {
        path: 'reports/profit-loss',
        element: (
          <RequireOwner>
            <ProfitLossPage />
          </RequireOwner>
        ),
      },
      { path: 'reports/receivables-ageing', element: <ReceivablesAgeingReportPage /> },
      { path: 'reports/customer-statements', element: <CustomerStatementsPage /> },
      {
        path: 'reports/collection',
        element: (
          <RequireOwner>
            <CollectionReportPage />
          </RequireOwner>
        ),
      },
      {
        path: 'reports/expenses',
        element: (
          <RequireOwner>
            <ExpenseReportPage />
          </RequireOwner>
        ),
      },
      {
        path: 'reports/cost-per-bottle',
        element: (
          <RequireOwner>
            <CostPerBottlePage />
          </RequireOwner>
        ),
      },
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
      { path: 'help', element: <HelpPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
