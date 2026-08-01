import { describe, expect, it } from 'vitest'
import { invoicePdfFileName, slugifyName } from './slug'

describe('slugifyName', () => {
  it('keeps Urdu letters', () => {
    expect(slugifyName('علی خان')).toContain('علی')
  })

  it('builds invoice file names', () => {
    expect(
      invoicePdfFileName({
        invoiceNo: 'INV-2026-07-0001',
        customerCode: 'C-001',
        customerName: 'Ahmed Khan',
      }),
    ).toBe('INV-2026-07-0001-C-001-Ahmed-Khan.pdf')
  })
})
