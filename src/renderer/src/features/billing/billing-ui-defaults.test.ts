import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('billing UI period defaults', () => {
  const files = [
    'src/renderer/src/features/billing/GenerateBillsPage.tsx',
    'src/renderer/src/features/billing/InvoiceListPage.tsx',
  ]

  it('defaults generate bills and the invoice list to the current month', () => {
    for (const rel of files) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(src, rel).not.toMatch(/previousPeriod\(\s*currentPeriod\(\)\s*\)/)
      expect(src, rel).toContain('useState(currentPeriod())')
    }
  })
})
