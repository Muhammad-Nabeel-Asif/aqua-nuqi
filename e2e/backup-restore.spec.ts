import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  waitForApi,
  waitForSetup,
} from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('backup from one userData restores customers into a fresh profile', async () => {
  const launched = await launchApp()
  const stash = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-bak-stash-'))
  try {
    const { page } = launched
    await completeSetupViaIpc(page)
    await invoke(page, 'customers:create', {
      name: 'Restore Cust',
      rate: 6000,
      joinedOn: '2026-06-01',
    })
    const bak = await invoke<{ filePath: string }>(page, 'backup:create', { kind: 'manual' })
    const zipCopy = path.join(stash, 'backup.zip')
    fs.copyFileSync(bak.filePath, zipCopy)
    await launched.app.close()

    const restored = await launchApp()
    try {
      await waitForSetup(restored.page)
      await invoke(restored.page, 'setup:restore', { backupFilePath: zipCopy })
      await setHash(restored.page, '#/login')
      await restored.page.reload()
      await waitForApi(restored.page)
      await expectLogin(restored.page)
      await restored.page.getByTestId(IDS.loginUsername).fill('owner')
      await restored.page.getByTestId(IDS.loginPassword).fill(OWNER_PASSWORD)
      await restored.page.getByTestId(IDS.loginSubmit).click()
      await expectDashboard(restored.page)
      const listed = await invoke<{ items: Array<{ name: string }>; total: number }>(
        restored.page,
        'customers:list',
        {},
      )
      expect(listed.total).toBe(1)
      expect(listed.items[0]?.name).toBe('Restore Cust')
    } finally {
      await closeApp(restored)
    }
  } finally {
    try {
      await launched.app.close()
    } catch {
      // already closed
    }
    fs.rmSync(launched.root, { recursive: true, force: true })
    fs.rmSync(stash, { recursive: true, force: true })
  }
})
