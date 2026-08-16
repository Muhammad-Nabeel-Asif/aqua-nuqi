import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

export const OWNER_PASSWORD = 'secret12'
export const PRODUCT_FOLDER = 'Aqua Nuqi'

export type LaunchedApp = {
  app: ElectronApplication
  page: Page
  userData: string
  root: string
}

function repoRoot(): string {
  return path.resolve(__dirname, '../..')
}

function electronExecutable(): string {
  const req = createRequire(path.join(repoRoot(), 'package.json'))
  return req('electron') as string
}

function envRecord(userData: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  env.ELECTRON_RUN_AS_NODE = ''
  env.ELECTRON_RENDERER_URL = ''
  env.AQUA_NUQI_USER_DATA = userData
  env.CI = env.CI || '1'
  return env
}

export function makeUserData(): { root: string; userData: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-e2e-'))
  const userData = path.join(root, PRODUCT_FOLDER)
  fs.mkdirSync(userData, { recursive: true })
  return { root, userData }
}

export async function waitForApi(page: Page): Promise<void> {
  await page.waitForFunction('Boolean(window.api)', undefined, { timeout: 30_000 })
}

export async function setHash(page: Page, hash: string): Promise<void> {
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}`)
}

export async function launchApp(opts?: { userData?: string; root?: string }): Promise<LaunchedApp> {
  const created = opts?.userData ? null : makeUserData()
  const root = opts?.root ?? created!.root
  const userData = opts?.userData ?? created!.userData
  fs.mkdirSync(userData, { recursive: true })

  const env = envRecord(userData)
  const args = [repoRoot(), '--no-sandbox']

  const app = await electron.launch({
    executablePath: electronExecutable(),
    args,
    cwd: repoRoot(),
    env,
    timeout: 45_000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await waitForApi(page)
  return { app, page, userData, root }
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  try {
    await launched.app.close()
  } finally {
    fs.rmSync(launched.root, { recursive: true, force: true })
  }
}

export async function waitForSetup(page: Page): Promise<void> {
  await expect(page.getByTestId('setup-new-business')).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/#\/setup/)
}

export async function expectDashboard(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 })
}

export async function expectLogin(page: Page): Promise<void> {
  await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 30_000 })
}
