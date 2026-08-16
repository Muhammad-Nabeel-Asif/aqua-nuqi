import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('create customer then enter daily qty 2 and persist', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)

    await setHash(page, '#/customers')
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
    await page.getByTestId(IDS.customerNew).click()
    await page.getByTestId(IDS.customerName).fill('Daily Cust')
    await page.getByTestId(IDS.customerRate).fill('60')
    await page.getByTestId(IDS.customerSave).click()
    await expect(page.getByText('Daily Cust')).toBeVisible()

    await setHash(page, '#/deliveries/daily')
    await expect(page.getByRole('heading', { name: 'Daily entry' })).toBeVisible()
    const date = await page.getByTestId(IDS.dailyDate).inputValue()
    const qty = page.getByTestId(IDS.dailyQty0)
    await expect(qty).toBeVisible()
    await qty.click()
    await qty.fill('2')
    await qty.blur()

    await expect
      .poll(async () => {
        const list = await invoke<{
          items: Array<{ name: string; quantity: number | null }>
        }>(page, 'deliveries:getDayList', { date })
        const row = list.items.find((r) => r.name === 'Daily Cust')
        return row?.quantity ?? null
      })
      .toBe(2)
  } finally {
    await closeApp(launched)
  }
})
