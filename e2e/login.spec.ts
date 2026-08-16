import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { IDS } from './helpers/ids'
import {
  closeApp,
  expectDashboard,
  expectLogin,
  launchApp,
  OWNER_PASSWORD,
  setHash,
} from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('wrong password stays on login; correct owner reaches dashboard', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'auth:logout', {})
    await setHash(page, '#/login')
    await page.reload()
    await expectLogin(page)

    await page.getByTestId(IDS.loginUsername).fill('owner')
    await page.getByTestId(IDS.loginPassword).fill('wrongpass')
    await page.getByTestId(IDS.loginSubmit).click()
    await expect(page.getByTestId(IDS.loginError)).toBeVisible()
    await expect(page).toHaveURL(/#\/login/)

    await page.getByTestId(IDS.loginPassword).fill(OWNER_PASSWORD)
    await page.getByTestId(IDS.loginSubmit).click()
    await expectDashboard(page)
  } finally {
    await closeApp(launched)
  }
})
