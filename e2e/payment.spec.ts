import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, launchApp, setHash } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('recording a cash payment drops outstanding', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    const created = await invoke<{ item: { id: number; name: string } }>(page, 'customers:create', {
      name: 'Pay Cust',
      rate: 6000,
      joinedOn: '2026-06-01',
    })
    await invoke(page, 'deliveries:upsert', {
      customerId: created.item.id,
      date: '2026-07-15',
      quantity: 2,
    })
    const draft = await invoke<{ item: { id: number; totalPayable: number } }>(
      page,
      'invoices:generate',
      { customerId: created.item.id, period: '2026-07', issueDate: '2026-08-01' },
    )
    await invoke(page, 'invoices:issue', { id: draft.item.id })
    const before = draft.item.totalPayable

    await setHash(page, '#/payments')
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible()
    await page.getByTestId(IDS.recordPayment).click()
    await page.getByTestId(IDS.paymentCustomerSearch).fill('Pay')
    await page.getByRole('button', { name: /Pay Cust/ }).click()
    await page.getByTestId(IDS.paymentAmount).fill('50')
    await page.getByTestId(IDS.paymentSubmit).click()
    await expect(page.getByText('Payment recorded')).toBeVisible()

    const listed = await invoke<{ items: Array<{ id: number; balance: number }> }>(
      page,
      'customers:list',
      {},
    )
    const row = listed.items.find((c) => c.id === created.item.id)
    expect(row?.balance).toBe(before - 5000)
  } finally {
    await closeApp(launched)
  }
})
