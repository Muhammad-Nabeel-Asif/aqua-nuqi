import { test, expect } from '@playwright/test'
import { invoke, invokeRaw } from './helpers/api'
import { closeApp, launchApp } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('period close blocks upsert; reopen allows it again', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    const created = await invoke<{ item: { id: number } }>(page, 'customers:create', {
      name: 'Lock Cust',
      rate: 6000,
      joinedOn: '2026-06-01',
    })
    await invoke(page, 'period:close', { period: '2026-07' })
    const blocked = await invokeRaw(page, 'deliveries:upsert', {
      customerId: created.item.id,
      date: '2026-07-15',
      quantity: 1,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('PERIOD_LOCKED')

    await invoke(page, 'period:reopen', {
      period: '2026-07',
      reason: 'Missed a delivery',
    })
    const allowed = await invoke<{ item: { quantity: number } }>(page, 'deliveries:upsert', {
      customerId: created.item.id,
      date: '2026-07-15',
      quantity: 1,
    })
    expect(allowed.item.quantity).toBe(1)
  } finally {
    await closeApp(launched)
  }
})
