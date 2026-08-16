import type { Page } from '@playwright/test'
import { invoke } from './api'
import { IDS } from './ids'
import {
  expectDashboard,
  expectLogin,
  OWNER_PASSWORD,
  setHash,
  waitForApi,
  waitForSetup,
} from './launch'

export const SETUP_PAYLOAD = {
  businessName: 'E2E Plant',
  address: 'Lahore',
  phone: '03001234567',
  currencyCode: 'PKR',
  currencySymbol: 'Rs',
  dateFormat: 'dd-MM-yyyy',
  decimalPlaces: 0,
  backupFolder: '',
  ownerUsername: 'owner',
  ownerDisplayName: 'Owner',
  ownerPassword: OWNER_PASSWORD,
}

async function signInOnLoginPage(page: Page, username: string, password: string): Promise<void> {
  await expectLogin(page)
  await page.getByTestId(IDS.loginUsername).fill(username)
  await page.getByTestId(IDS.loginPassword).fill(password)
  await page.getByTestId(IDS.loginSubmit).click()
  await expectDashboard(page)
}

export async function completeSetupViaIpc(page: Page): Promise<void> {
  await waitForSetup(page)
  await invoke(page, 'setup:complete', SETUP_PAYLOAD)
  await setHash(page, '#/login')
  await page.reload()
  await waitForApi(page)
  await signInOnLoginPage(page, 'owner', OWNER_PASSWORD)
}

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await setHash(page, '#/login')
  await page.reload()
  await waitForApi(page)
  await signInOnLoginPage(page, username, password)
}
