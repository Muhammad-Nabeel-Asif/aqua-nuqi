import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('issuing an invoice locks that day’s delivery qty cell', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    const created = await invoke<{ item: { id: number; name: string } }>(page, 'customers:create', {
      name: 'Bill Cust',
      rate: 6000,
      joinedOn: '2026-06-01',
    })
    await invoke(page, 'deliveries:upsert', {
      customerId: created.item.id,
      date: '2026-07-15',
      quantity: 2,
    })

    await setHash(page, '#/billing/generate')
    await expect(page.getByRole('heading', { name: 'Generate bills' })).toBeVisible()
    await page.getByTestId(IDS.billingPeriod).fill('2026-07')
    await expect(page.getByText('Bill Cust')).toBeVisible()
    await page.getByRole('button', { name: 'Select all' }).click()
    await page.getByTestId(IDS.generateBills).click()
    await expect(page.getByText(/invoice(s)? generated/i)).toBeVisible()
    await page.getByTestId(IDS.issueInvoices).click()
    await expect(page.getByText(/Sent /)).toBeVisible()

    await setHash(page, '#/deliveries/daily')
    await expect(page.getByRole('heading', { name: 'Daily entry' })).toBeVisible()
    await page.getByTestId(IDS.dailyDate).fill('2026-07-15')
    const qty = page.getByTestId(IDS.dailyQty0)
    await expect(qty).toBeVisible()
    await expect(qty).toBeDisabled()
  } finally {
    await closeApp(launched)
  }
})
