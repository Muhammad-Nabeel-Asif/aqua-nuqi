import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { invoke } from './helpers/api'
import { closeApp, launchApp } from './helpers/launch'
import { completeSetupViaIpc } from './helpers/setup-business'

test('CSV import parse + commit creates both fixture customers', async () => {
  const launched = await launchApp()
  try {
    const { page } = launched
    await completeSetupViaIpc(page)

    const csvPath = path.join(__dirname, 'fixtures', 'customers.csv')
    const base64 = fs.readFileSync(csvPath).toString('base64')
    const parsed = await invoke<{
      suggestedMapping: Record<string, string>
      totalRows: number
    }>(page, 'customers:importParse', { fileName: 'customers.csv', base64 })
    expect(parsed.totalRows).toBe(2)

    const committed = await invoke<{ imported: number }>(page, 'customers:importCommit', {
      fileName: 'customers.csv',
      base64,
      mapping: parsed.suggestedMapping,
      createMissingAreas: true,
      createMissingRoutes: true,
    })
    expect(committed.imported).toBe(2)

    const listed = await invoke<{ items: Array<{ name: string }>; total: number }>(
      page,
      'customers:list',
      { search: 'Import' },
    )
    const names = listed.items.map((c) => c.name).sort()
    expect(names).toEqual(['Import One', 'Import Two'])
  } finally {
    await closeApp(launched)
  }
})
