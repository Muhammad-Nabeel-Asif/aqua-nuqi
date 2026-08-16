import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('present-month then cycling a cell updates attendance', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'employees:create', {
      name: 'Attendee',
      role: 'delivery',
      joiningDate: '2026-06-01',
      salaryType: 'monthly',
      baseAmount: 2_000_000,
      salaryEffectiveFrom: '2026-06-01',
    })

    await setHash(page, '#/employees/attendance')
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible()
    await expect(page.getByText('Attendee', { exact: true })).toBeVisible()

    const period = await page.getByTestId(IDS.attendancePeriod).inputValue()
    await page.getByTestId(IDS.attendancePresentMonth).click()

    let presentDate: string | null = null
    await expect
      .poll(async () => {
        const month = await invoke<{
          rows: Array<{
            name: string
            cells: Array<{ date: string; status: string | null }>
          }>
        }>(page, 'attendance:getMonth', { period })
        const row = month.rows.find((r) => r.name === 'Attendee')
        presentDate = row?.cells.find((c) => c.status === 'present')?.date ?? null
        return presentDate
      })
      .not.toBeNull()

    if (!presentDate) throw new Error('expected a present attendance cell after Present month')
    await page.getByTestId(`att-${presentDate}`).click()

    await expect
      .poll(async () => {
        const month = await invoke<{
          rows: Array<{
            name: string
            cells: Array<{ date: string; status: string | null }>
          }>
        }>(page, 'attendance:getMonth', { period })
        const row = month.rows.find((r) => r.name === 'Attendee')
        return row?.cells.find((c) => c.date === presentDate)?.status ?? null
      })
      .toBe('absent')
  } finally {
    await closeApp(launched)
  }
})
