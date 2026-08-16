import { test, expect } from '@playwright/test'
import { closeApp, launchApp, waitForSetup } from './helpers/launch'

test('built app launches to first-run setup', async () => {
  const launched = await launchApp()
  try {
    await waitForSetup(launched.page)
    await expect(launched.page.getByText('Set up a new business')).toBeVisible()
    await expect(launched.page).toHaveURL(/#\/setup/)
  } finally {
    await closeApp(launched)
  }
})
