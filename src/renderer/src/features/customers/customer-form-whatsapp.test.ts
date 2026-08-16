import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('customer form WhatsApp copy', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/renderer/src/features/customers/CustomerFormDialog.tsx'),
    'utf8',
  )

  it('does not copy primary phone into WhatsApp one keystroke at a time', () => {
    expect(src).not.toMatch(/if \(!form\.whatsappNumber\) set\('whatsappNumber'/)
  })

  it('copies the full primary phone once on save when WhatsApp is blank', () => {
    expect(src).toContain(
      'if (form.phonePrimary && !form.whatsappNumber) input.whatsappNumber = form.phonePrimary',
    )
  })
})
