import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import { closeApp, expectDashboard, launchApp, OWNER_PASSWORD } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('session lock overlay unlocks with the owner password', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'auth:lock', {})
    await expect(page.getByText('Session locked')).toBeVisible()
    await page.getByTestId(IDS.lockPassword).fill(OWNER_PASSWORD)
    await page.getByTestId(IDS.lockSubmit).click()
    await expect(page.getByText('Session locked')).toHaveCount(0)
    await expectDashboard(page)
  } finally {
    await closeApp(launched)
  }
})
