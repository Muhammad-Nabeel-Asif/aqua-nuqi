import { describe, expect, it } from 'vitest'
import { popNavHistory, previousNavPath, pushNavHistory, resetNavHistory } from './nav-history'
import { crumbsForPath, parentPath } from './route-crumbs'

describe('crumbsForPath', () => {
  it('builds nested crumbs for month grid, a bill, and a report', () => {
    expect(crumbsForPath('/deliveries/matrix').map((c) => c.label)).toEqual([
      'Deliveries',
      'Month grid',
    ])
    expect(parentPath('/deliveries/matrix')).toBe('/deliveries/daily')
    expect(crumbsForPath('/billing/invoices/12').map((c) => c.label)).toEqual(['Billing', 'Bill'])
    expect(crumbsForPath('/reports/profit-loss').map((c) => c.label)).toEqual([
      'Reports',
      'Profit (income minus costs)',
    ])
    expect(parentPath('/reports/profit-loss')).toBe('/reports')
  })

  it('uses Settings → Backup for the backup tab URL', () => {
    expect(crumbsForPath('/settings/backup').map((c) => c.label)).toEqual(['Settings', 'Backup'])
  })
})

describe('nav-history', () => {
  it('Back returns to the previous in-app screen, not a hardcoded parent', () => {
    resetNavHistory()
    pushNavHistory('/customers')
    pushNavHistory('/deliveries/matrix')
    expect(previousNavPath()).toBe('/customers')
    expect(popNavHistory()).toBe('/customers')
  })

  it('ignores login', () => {
    resetNavHistory()
    pushNavHistory('/login')
    pushNavHistory('/')
    expect(previousNavPath()).toBeNull()
  })
})
