export type RouteCrumb = { label: string; to?: string }

const SETTINGS_TABS: Record<string, string> = {
  business: 'Business',
  locale: 'Language, money and dates',
  invoice: 'Invoice',
  billing: 'Billing',
  master: 'Lists',
  backup: 'Backup',
  users: 'Users & security',
  maintenance: 'Check data',
  audit: 'Activity log',
  about: 'About',
}

const REPORT_TITLES: Record<string, string> = {
  'sales-summary': 'Sales summary',
  'customer-sales': 'Sales by customer',
  'area-route-performance': 'Area / route',
  'employee-delivery': 'Staff deliveries',
  'customer-activity': 'Customer activity',
  'profit-loss': 'Profit (income minus costs)',
  'receivables-ageing': 'How long bills have been unpaid',
  collection: 'Money collected',
  'customer-statements': 'Customer statements',
  expenses: 'Expenses',
  'cost-per-bottle': 'Cost per bottle',
  'bottle-loss': 'Bottle loss',
  'trip-variance': 'Trip difference',
  'stock-movements': 'Bottle stock history',
}

/**
 * Breadcrumbs for the current hash path. Section homes are a single crumb;
 * nested screens include a parent link.
 */
export function crumbsForPath(pathname: string): RouteCrumb[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)

  if (path === '/') return [{ label: 'Dashboard' }]

  if (parts[0] === 'deliveries') {
    const root: RouteCrumb[] = [{ label: 'Deliveries', to: '/deliveries/daily' }]
    if (parts[1] === 'daily' || !parts[1]) return root
    if (parts[1] === 'matrix') return [...root, { label: 'Month grid' }]
    if (parts[1] === 'bottles-out') return [...root, { label: 'Bottles out' }]
    return root
  }

  if (parts[0] === 'customers') {
    const root: RouteCrumb[] = [{ label: 'Customers', to: '/customers' }]
    if (!parts[1]) return root
    if (parts[2] === 'card') {
      return [
        ...root,
        { label: 'Customer', to: `/customers/${parts[1]}` },
        { label: 'Delivery card' },
      ]
    }
    return [...root, { label: 'Customer' }]
  }

  if (parts[0] === 'billing') {
    const root: RouteCrumb[] = [{ label: 'Billing', to: '/billing/invoices' }]
    if (parts[1] === 'invoices' && parts[2]) return [...root, { label: 'Bill' }]
    if (parts[1] === 'invoices' || !parts[1]) return root
    if (parts[1] === 'generate') return [...root, { label: 'Generate bills' }]
    if (parts[1] === 'periods') return [...root, { label: 'Billing months' }]
    return root
  }

  if (parts[0] === 'payments') return [{ label: 'Payments' }]
  if (parts[0] === 'receivables') return [{ label: 'Unpaid bills' }]

  if (parts[0] === 'expenses') {
    const root: RouteCrumb[] = [{ label: 'Expenses', to: '/expenses' }]
    if (parts[1] === 'categories') return [...root, { label: 'Categories' }]
    return root
  }

  if (parts[0] === 'employees') {
    const root: RouteCrumb[] = [{ label: 'Employees', to: '/employees' }]
    if (!parts[1]) return root
    if (parts[1] === 'attendance') return [...root, { label: 'Attendance' }]
    if (parts[1] === 'advances') return [...root, { label: 'Advances' }]
    return [...root, { label: 'Employee' }]
  }

  if (parts[0] === 'payroll') return [{ label: 'Monthly salaries' }]

  if (parts[0] === 'inventory') {
    const root: RouteCrumb[] = [{ label: 'Inventory', to: '/inventory' }]
    if (!parts[1]) return root
    if (parts[1] === 'vehicles') return [...root, { label: 'Vehicles' }]
    if (parts[1] === 'trips') return [...root, { label: 'Trips' }]
    if (parts[1] === 'bottles-out') return [...root, { label: 'Bottles out' }]
    return root
  }

  if (parts[0] === 'reports') {
    const root: RouteCrumb[] = [{ label: 'Reports', to: '/reports' }]
    if (!parts[1]) return root
    return [...root, { label: REPORT_TITLES[parts[1]] ?? parts[1].replace(/-/g, ' ') }]
  }

  if (parts[0] === 'settings') {
    const root: RouteCrumb[] = [{ label: 'Settings', to: '/settings' }]
    const tab = parts[1] ?? 'business'
    if (tab === 'business') return root
    return [...root, { label: SETTINGS_TABS[tab] ?? tab }]
  }

  if (parts[0] === 'help') return [{ label: 'Help' }]

  return [{ label: parts[0] ?? 'Home' }]
}

export function parentPath(pathname: string): string | null {
  const crumbs = crumbsForPath(pathname)
  for (let i = crumbs.length - 2; i >= 0; i--) {
    if (crumbs[i]?.to) return crumbs[i]!.to!
  }
  return null
}
