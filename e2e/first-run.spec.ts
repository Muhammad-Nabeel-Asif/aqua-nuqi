import { test, expect } from '@playwright/test'
import { IDS } from './helpers/ids'
import {
  closeApp,
  launchApp,
  waitForSetup,
  expectDashboard,
  OWNER_PASSWORD,
} from './helpers/launch'

test.describe.configure({ mode: 'serial' })

test('first-run wizard creates an owner and reaches the dashboard', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await waitForSetup(page)
    await page.getByTestId(IDS.setupNewBusiness).click()
    await page.getByTestId(IDS.setupContinue).click()
    await page.getByTestId(IDS.setupContinue).click()
    await page.getByTestId(IDS.setupContinue).click()
    await page.getByTestId(IDS.setupOwnerPassword).fill(OWNER_PASSWORD)
    await page.getByTestId(IDS.setupOwnerPassword2).fill(OWNER_PASSWORD)
    await page.getByTestId(IDS.setupFinish).click()
    await expect(page.getByText('Save your recovery code')).toBeVisible()
    await expect(page.getByText(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeVisible()
    await page.getByTestId(IDS.setupSavedRecovery).click()
    await expectDashboard(page)
    await expect(page).toHaveURL(/#\/$|#\/\?/)
  } finally {
    await closeApp(launched)
  }
})
