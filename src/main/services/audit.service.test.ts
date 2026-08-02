import { describe, expect, it } from 'vitest'
import { buildAuditDiff } from './audit.service'

describe('buildAuditDiff', () => {
  it('shows readable paisa-level diffs for delivery edit, rate change, payroll and invoice void', () => {
    const delivery = buildAuditDiff(
      JSON.stringify({ quantity: 5, rate: 6000, lineTotal: 30000 }),
      JSON.stringify({ quantity: 6, rate: 6000, lineTotal: 36000 }),
    )
    expect(delivery).toEqual(
      expect.arrayContaining([
        { field: 'quantity', oldValue: '5', newValue: '6' },
        { field: 'lineTotal', oldValue: '30000', newValue: '36000' },
      ]),
    )
    expect(delivery.find((d) => d.field === 'rate')).toBeUndefined()

    const rate = buildAuditDiff(
      JSON.stringify({ rate: 6000, effectiveFrom: '2026-07-01' }),
      JSON.stringify({ rate: 6500, effectiveFrom: '2026-08-01' }),
    )
    expect(rate).toEqual(
      expect.arrayContaining([
        { field: 'rate', oldValue: '6000', newValue: '6500' },
        { field: 'effectiveFrom', oldValue: '2026-07-01', newValue: '2026-08-01' },
      ]),
    )

    const payroll = buildAuditDiff(
      JSON.stringify({ status: 'draft', netPay: 5000000 }),
      JSON.stringify({ status: 'finalised', netPay: 5000000 }),
    )
    expect(payroll).toContainEqual({ field: 'status', oldValue: 'draft', newValue: 'finalised' })
    expect(payroll.find((d) => d.field === 'netPay')).toBeUndefined()

    const voidDiff = buildAuditDiff(
      JSON.stringify({
        status: 'issued',
        invoiceTotal: 120000,
        totalPayable: 150000,
        deliveryIds: [1, 2],
        depositLines: [{ lineNo: 3, amount: -50000 }],
      }),
      JSON.stringify({
        status: 'void',
        reason: 'Correction',
        invoiceTotal: 120000,
        totalPayable: 150000,
        deliveryIds: [],
        depositLines: [{ lineNo: 3, amount: -50000 }],
        paidTotal: 0,
      }),
    )
    expect(voidDiff).toEqual(
      expect.arrayContaining([
        { field: 'status', oldValue: 'issued', newValue: 'void' },
        { field: 'deliveryIds', oldValue: '[1,2]', newValue: '[]' },
        { field: 'reason', oldValue: null, newValue: 'Correction' },
        { field: 'paidTotal', oldValue: null, newValue: '0' },
      ]),
    )
    expect(voidDiff.find((d) => d.field === 'invoiceTotal')).toBeUndefined()
  })
})
