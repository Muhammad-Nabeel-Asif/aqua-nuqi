import { test, expect } from '@playwright/test'
import { invoke, invokeRaw } from './helpers/api'
import { closeApp, launchApp, OWNER_PASSWORD, setHash } from './helpers/launch'
import { completeSetupViaIpc, loginAs } from './helpers/setup-business'

test('operator cannot open Settings/Expenses but can open daily entry', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'auth:createUser', {
      username: 'clerk',
      displayName: 'Clerk',
      password: OWNER_PASSWORD,
      role: 'operator',
    })
    await invoke(page, 'auth:logout', {})
    await loginAs(page, 'clerk', OWNER_PASSWORD)

    await setHash(page, '#/settings')
    await expect(page.getByRole('heading', { name: 'Owner only' })).toBeVisible()

    await setHash(page, '#/expenses')
    await expect(page.getByRole('heading', { name: 'Owner only' })).toBeVisible()

    await setHash(page, '#/deliveries/daily')
    await expect(page.getByRole('heading', { name: 'Daily entry' })).toBeVisible()

    const forbidden = await invokeRaw(page, 'settings:setMany', {
      values: { 'business.name': 'Hacked' },
    })
    expect(forbidden.ok).toBe(false)
    if (!forbidden.ok) expect(forbidden.error.code).toBe('FORBIDDEN')
  } finally {
    await closeApp(launched)
  }
})
