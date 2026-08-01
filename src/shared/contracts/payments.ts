import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'cheque',
  'online',
  'other',
])

export const paymentAllocationDto = z.object({
  id: z.number().int(),
  paymentId: z.number().int(),
  invoiceId: z.number().int(),
  invoiceNo: z.string(),
  amount: z.number().int(),
})

export const paymentDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  receiptNo: z.string().nullable(),
  customerId: z.number().int(),
  customerCode: z.string(),
  customerName: z.string(),
  paymentDate: businessDate,
  amount: z.number().int(),
  method: paymentMethodSchema,
  referenceNo: z.string().nullable(),
  receivedByEmployeeId: z.number().int().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['active', 'void']),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.number().int().nullable(),
  allocations: z.array(paymentAllocationDto),
  unallocated: z.number().int(),
})
export type PaymentDto = z.infer<typeof paymentDto>

export const recordPaymentInput = z.object({
  customerId: z.number().int().positive(),
  date: businessDate,
  amount: z.number().int().positive(),
  method: paymentMethodSchema,
  referenceNo: z.string().optional().nullable(),
  receivedByEmployeeId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.number().int().positive(),
        amount: z.number().int().positive(),
      }),
    )
    .optional(),
})
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>
export const recordPaymentOutput = z.object({ item: paymentDto })

export const voidPaymentInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1),
})
export const voidPaymentOutput = z.object({ item: paymentDto })

export const reallocatePaymentInput = z.object({
  id: z.number().int().positive(),
  allocations: z.array(
    z.object({
      invoiceId: z.number().int().positive(),
      amount: z.number().int().positive(),
    }),
  ),
})
export const reallocatePaymentOutput = z.object({ item: paymentDto })

export const listPaymentsInput = z.object({
  from: businessDate.optional(),
  to: businessDate.optional(),
  method: paymentMethodSchema.optional(),
  customerId: z.number().int().positive().optional(),
  status: z.enum(['active', 'void']).optional(),
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().min(0).optional(),
})
export const listPaymentsOutput = z.object({
  items: z.array(paymentDto),
  total: z.number().int(),
  totalAmount: z.number().int(),
})

export const getPaymentInput = z.object({ id: z.number().int().positive() })
export const getPaymentOutput = z.object({ item: paymentDto })

export const postCollectedCashInput = z.object({ date: businessDate })
export const postCollectedCashOutput = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  paymentIds: z.array(z.number().int()),
  totalAmount: z.number().int(),
})

export const collectedCashPreviewInput = z.object({ date: businessDate })
export const collectedCashPreviewOutput = z.object({
  date: businessDate,
  rows: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      cashCollected: z.number().int(),
      alreadyPosted: z.boolean(),
    }),
  ),
  total: z.number().int(),
})

export const ageingBucketSchema = z.enum(['current', '1-30', '31-60', '60+'])

export const receivableRowDto = z.object({
  customerId: z.number().int(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  areaName: z.string().nullable(),
  routeName: z.string().nullable(),
  balance: z.number().int(),
  oldestUnpaidInvoiceDate: businessDate.nullable(),
  daysOverdue: z.number().int(),
  ageingBucket: ageingBucketSchema,
  lastPaymentDate: businessDate.nullable(),
})

export const receivablesReportInput = z.object({
  asOf: businessDate.optional(),
})
export const receivablesReportOutput = z.object({
  asOf: businessDate,
  outstanding: z.array(receivableRowDto),
  inCredit: z.array(receivableRowDto),
  bucketTotals: z.object({
    current: z.number().int(),
    '1-30': z.number().int(),
    '31-60': z.number().int(),
    '60+': z.number().int(),
  }),
  totalOutstanding: z.number().int(),
  totalCredit: z.number().int(),
})
