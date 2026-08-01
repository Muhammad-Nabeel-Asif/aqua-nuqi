import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  copyExpenseReceipt,
  MAX_RECEIPT_WARN_BYTES,
  resolveAttachmentAbsolute,
} from './expense-attachments'

describe('expense attachments', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-att-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('copies a receipt into attachments/expenses/<YYYY>/<uuid>.<ext>', () => {
    const src = path.join(dir, 'receipt.jpg')
    fs.writeFileSync(src, Buffer.alloc(1024, 1))
    const result = copyExpenseReceipt({
      userData: dir,
      sourcePath: src,
      expenseDate: '2026-08-15',
    })
    expect(result.relativePath).toMatch(/^expenses\/2026\/[0-9a-f-]+\.jpg$/)
    expect(result.absolutePath).toBe(resolveAttachmentAbsolute(dir, result.relativePath))
    expect(fs.existsSync(result.absolutePath)).toBe(true)
    expect(fs.statSync(result.absolutePath).size).toBe(1024)
    expect(result.warnedLarge).toBe(false)
    expect(result.downscaled).toBe(false)
  })

  it('warns when the copied file is larger than 5 MB', () => {
    const src = path.join(dir, 'big.pdf')
    fs.writeFileSync(src, Buffer.alloc(MAX_RECEIPT_WARN_BYTES + 1, 2))
    const result = copyExpenseReceipt({
      userData: dir,
      sourcePath: src,
      expenseDate: '2026-08-01',
    })
    expect(result.warnedLarge).toBe(true)
    expect(result.relativePath.endsWith('.pdf')).toBe(true)
  })
})
