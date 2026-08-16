import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { toPaisa } from '@shared/money'

describe('employeeService', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-emp-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('creates an employee with salary and lists them as active', async () => {
    const { services, owner } = app
    const emp = services.employees.create(
      {
        name: 'Ali Driver',
        role: 'delivery',
        joiningDate: '2026-06-01',
        salaryType: 'monthly',
        baseAmount: Number(toPaisa(30_000)),
        salaryEffectiveFrom: '2026-06-01',
      },
      owner.id,
    )
    expect(emp.name).toBe('Ali Driver')
    expect(emp.status).toBe('active')

    const listed = services.employees.list({}).items
    expect(listed.some((e) => e.id === emp.id)).toBe(true)

    const detail = services.employees.getById(emp.id)
    expect(detail.salaryHistory.length).toBeGreaterThan(0)
    expect(detail.salaryHistory[0]?.baseAmount).toBe(Number(toPaisa(30_000)))
  })
})
