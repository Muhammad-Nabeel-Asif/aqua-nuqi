import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('owner can create a recurring expense from the expenses page', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)

    await setHash(page, '#/expenses')
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible()
    await page.getByTestId(IDS.recurringManage).click()
    await page.getByTestId(IDS.recurringName).fill('Shop rent')
    await page.getByTestId(IDS.recurringCategory).selectOption({ label: 'Rent' })
    await page.getByTestId(IDS.recurringAmount).fill('15000')
    await page.getByTestId(IDS.recurringAdd).click()

    await expect(page.getByText('Shop rent', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const listed = await invoke<{ items: Array<{ name: string; amount: number }> }>(
          page,
          'recurringExpenses:list',
          { includeInactive: true },
        )
        const row = listed.items.find((r) => r.name === 'Shop rent')
        return row?.amount ?? null
      })
      .toBe(1_500_000)
  } finally {
    await closeApp(launched)
  }
})
