import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { toPaisa } from '@shared/money'

describe('attendanceService', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-att-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('markAllPresent then setOne absent is reflected in the month grid', async () => {
    const { services, owner } = app
    const emp = services.employees.create(
      {
        name: 'Attendee',
        joiningDate: '2026-07-01',
        baseAmount: Number(toPaisa(20_000)),
        salaryEffectiveFrom: '2026-07-01',
      },
      owner.id,
    )
    services.attendance.markAllPresent({ period: '2026-07' }, owner.id)
    services.attendance.setOne(
      { employeeId: emp.id, date: '2026-07-15', status: 'absent' },
      owner.id,
    )
    const month = services.attendance.getMonth('2026-07')
    const row = month.rows.find((r) => r.employeeId === emp.id)
    expect(row).toBeTruthy()
    const cell = row?.cells.find((c) => c.date === '2026-07-15')
    expect(cell?.status).toBe('absent')
  })
})
