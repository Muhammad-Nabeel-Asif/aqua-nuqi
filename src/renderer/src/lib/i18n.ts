const en: Record<string, string> = {
  'app.name': 'Aqua Nuqi',
  'nav.dashboard': 'Dashboard',
  'nav.deliveries': 'Deliveries',
  'nav.customers': 'Customers',
  'nav.billing': 'Billing',
  'nav.payments': 'Payments',
  'nav.expenses': 'Expenses',
  'nav.employees': 'Employees',
  'nav.inventory': 'Inventory',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',
  'nav.receivables': 'Unpaid bills',
  'nav.payroll': 'Monthly salaries',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.continue': 'Continue',
  'action.back': 'Back',
  'action.login': 'Sign in',
  'action.logout': 'Sign out',
  'action.unlock': 'Unlock',
  'empty.comingSoon': 'Coming in Phase {phase}',
  'login.title': 'Sign in',
  'login.subtitle': 'Enter your username and password',
  'setup.welcome': 'Welcome to Aqua Nuqi',
  'setup.newBusiness': 'Set up a new business',
  'setup.restore': 'Restore from a backup',
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let value = en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(`{${k}}`, String(v))
    }
  }
  return value
}
