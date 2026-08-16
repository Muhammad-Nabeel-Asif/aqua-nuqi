import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('month matrix keyboard entry persists qty on adjacent days', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'customers:create', {
      name: 'Matrix Cust',
      rate: 6000,
      joinedOn: '2026-06-01',
    })

    await setHash(page, '#/deliveries/matrix')
    await expect(page.getByRole('heading', { name: 'Month grid' })).toBeVisible()
    await page.getByTestId(IDS.matrixPeriod).fill('2026-07')
    await expect(page.getByText('Matrix Cust')).toBeVisible()

    const day1 = page.getByTestId(IDS.matrixDay1)
    await expect(day1).toBeVisible()
    await day1.click()
    await day1.fill('2')
    await day1.press('Tab')
    await expect(page.getByTestId(IDS.matrixDay2)).toBeFocused()
    await page.keyboard.type('3')
    await page.keyboard.press('Tab')

    await expect
      .poll(async () => {
        const grid = await invoke<{
          rows: Array<{ name: string; cells: Array<{ day: number; quantity: number }> }>
        }>(page, 'deliveries:getMonthGrid', { period: '2026-07' })
        const row = grid.rows.find((r) => r.name === 'Matrix Cust')
        const q1 = row?.cells.find((c) => c.day === 1)?.quantity ?? null
        const q2 = row?.cells.find((c) => c.day === 2)?.quantity ?? null
        return [q1, q2]
      })
      .toEqual([2, 3])
  } finally {
    await closeApp(launched)
  }
})
