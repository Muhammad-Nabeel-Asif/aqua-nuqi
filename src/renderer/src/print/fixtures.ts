import logoUrl from '@renderer/assets/brand/logo-full.png'
import { BRAND_COLOURS, BRAND_NAME } from '@shared/brand'
import type { InvoiceTemplateProps } from './templates/InvoiceTemplate'

/**
 * Synthetic payloads for `#/print/:template?fixture=…` verification (no IPC).
 *
 * The real payload carries a base64 data URL; a bundled URL renders the same
 * in the print window and keeps these fixtures readable.
 */
export function invoiceFixture(lineCount: number): InvoiceTemplateProps {
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const day = String((i % 28) + 1).padStart(2, '0')
    return {
      lineNo: i + 1,
      lineType: 'delivery',
      lineDate: `2026-07-${day}`,
      description: '19 L Bottle',
      quantity: 2,
      rate: 6000,
      amount: 12000,
    }
  })
  const deliveriesQty = lineCount * 2
  const deliveriesTotal = lineCount * 12000
  return {
    business: {
      name: BRAND_NAME,
      address: 'Lahore',
      phone: '03001234567',
      phone2: '',
      email: 'billing@aquanuqi.local',
      bankDetails: 'JazzCash 0300-1234567',
      taxNumber: '',
      logoDataUrl: logoUrl,
      accentColour: BRAND_COLOURS.accent,
      footerNote: 'Thank you for your business.',
      termsText: 'Payment due within 10 days.',
      showBottleBalance: true,
      showRateColumn: true,
      currencySymbol: 'Rs',
      decimalPlaces: 0,
    },
    invoice: {
      invoiceNo: `INV-2026-07-FIX-${lineCount}`,
      period: '2026-07',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      issueDate: '2026-08-01',
      dueDate: '2026-08-11',
      openingBalance: 0,
      deliveriesQty,
      deliveriesTotal,
      chargesTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      invoiceTotal: deliveriesTotal,
      totalPayable: deliveriesTotal,
      bottlesWithCustomerAtIssue: 4,
      status: 'issued',
      lines,
    },
    customer: {
      code: 'C-0001',
      name: 'علی خان',
      addressLine: 'Model Town',
      phonePrimary: '03001234567',
      phoneSecondary: null,
      securityDepositHeld: 200000,
    },
    emptiesReturned: deliveriesQty - 2,
    amountInWords: 'Rupees Three Thousand One Hundred Twenty Only',
    generatedAt: '2026-08-01T10:00:00.000Z',
  }
}

export function thermalReceiptFixture(): Record<string, unknown> {
  return {
    kind: 'payment-receipt',
    variant: 'thermal',
    business: {
      name: BRAND_NAME,
      address: 'Lahore',
      phone: '03001234567',
      phone2: '',
      email: '',
      logoDataUrl: logoUrl,
      accentColour: BRAND_COLOURS.accent,
      currencySymbol: 'Rs',
      decimalPlaces: 0,
    },
    payment: {
      receiptNo: 'RCV-00001',
      paymentDate: '2026-08-01',
      customerCode: 'C-0001',
      customerName: 'علی خان',
      amount: 125000,
      method: 'cash',
      referenceNo: null,
    },
    balanceAfter: 50000,
    amountInWords: 'Rupees One Thousand Two Hundred Fifty Only',
    receivedBy: 'Owner',
    generatedAt: '2026-08-01T10:00:00.000Z',
  }
}

export function resolvePrintFixture(
  fixtureId: string,
): { template: string; payload: Record<string, unknown> } | null {
  if (fixtureId === 'invoice-26') {
    return {
      template: 'invoice',
      payload: invoiceFixture(26) as unknown as Record<string, unknown>,
    }
  }
  if (fixtureId === 'invoice-60') {
    return {
      template: 'invoice',
      payload: invoiceFixture(60) as unknown as Record<string, unknown>,
    }
  }
  if (fixtureId === 'receipt-thermal') {
    return { template: 'payment-receipt-thermal', payload: thermalReceiptFixture() }
  }
  return null
}
