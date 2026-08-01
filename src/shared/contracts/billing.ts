import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const period = z.string().regex(/^\d{4}-\d{2}$/)

export const invoiceStatusSchema = z.enum(['draft', 'issued', 'partially_paid', 'paid', 'void'])

export const invoiceLineDto = z.object({
  id: z.number().int(),
  lineNo: z.number().int(),
  lineType: z.enum([
    'delivery',
    'package',
    'rental',
    'charge',
    'discount',
    'deposit',
    'tax',
    'carry_forward',
  ]),
  lineDate: businessDate.nullable(),
  description: z.string(),
  quantity: z.number().int(),
  rate: z.number().int(),
  amount: z.number().int(),
  deliveryId: z.number().int().nullable(),
  adjustmentId: z.number().int().nullable(),
})
export type InvoiceLineDto = z.infer<typeof invoiceLineDto>

export const invoiceDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  invoiceNo: z.string(),
  customerId: z.number().int(),
  customerCode: z.string(),
  customerName: z.string(),
  period: period.nullable(),
  periodStart: businessDate,
  periodEnd: businessDate,
  issueDate: businessDate,
  dueDate: businessDate.nullable(),
  openingBalance: z.number().int(),
  deliveriesQty: z.number().int(),
  deliveriesTotal: z.number().int(),
  chargesTotal: z.number().int(),
  discountTotal: z.number().int(),
  taxTotal: z.number().int(),
  invoiceTotal: z.number().int(),
  totalPayable: z.number().int(),
  paidTotal: z.number().int(),
  closingBalance: z.number().int(),
  bottlesWithCustomerAtIssue: z.number().int(),
  status: invoiceStatusSchema,
  voidReason: z.string().nullable(),
  pdfPath: z.string().nullable(),
  lastSharedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().int().nullable(),
  lines: z.array(invoiceLineDto),
  balanceDue: z.number().int(),
  paymentHistory: z.array(
    z.object({
      paymentId: z.number().int(),
      receiptNo: z.string().nullable(),
      paymentDate: z.string(),
      method: z.string(),
      amount: z.number().int(),
      allocationStatus: z.enum(['active', 'superseded', 'void']),
      paymentStatus: z.enum(['active', 'void']),
    }),
  ),
})
export type InvoiceDto = z.infer<typeof invoiceDto>

export const invoicePreviewDto = z.object({
  customerId: z.number().int(),
  customerCode: z.string(),
  customerName: z.string(),
  period: period,
  periodStart: businessDate,
  periodEnd: businessDate,
  openingBalance: z.number().int(),
  deliveriesCount: z.number().int(),
  deliveriesQty: z.number().int(),
  deliveriesTotal: z.number().int(),
  chargesTotal: z.number().int(),
  discountTotal: z.number().int(),
  taxTotal: z.number().int(),
  invoiceTotal: z.number().int(),
  totalPayable: z.number().int(),
  bottlesWithCustomer: z.number().int(),
  lines: z.array(invoiceLineDto.omit({ id: true })),
  warnings: z.array(z.string()),
  skipReason: z.string().nullable(),
  existingInvoiceId: z.number().int().nullable(),
  existingStatus: z.string().nullable(),
})
export type InvoicePreviewDto = z.infer<typeof invoicePreviewDto>

export const batchFilterSchema = z.object({
  mode: z.enum(['all', 'area', 'route', 'selected']),
  areaId: z.number().int().positive().optional(),
  routeId: z.number().int().positive().optional(),
  customerIds: z.array(z.number().int().positive()).optional(),
})

export const previewInvoiceInput = z.object({
  customerId: z.number().int().positive(),
  period,
})
export const previewInvoiceOutput = z.object({ preview: invoicePreviewDto })

export const previewBatchInput = z.object({
  period,
  filter: batchFilterSchema,
  includeZeroActivity: z.boolean().optional(),
})
export const previewBatchOutput = z.object({ items: z.array(invoicePreviewDto) })

export const generateInvoiceInput = z.object({
  customerId: z.number().int().positive(),
  period,
  issueDate: businessDate.optional(),
  notes: z.string().optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export const generateInvoiceOutput = z.object({ item: invoiceDto })

export const generateBatchInput = z.object({
  period,
  filter: batchFilterSchema,
  issueDate: businessDate.optional(),
  includeZeroActivity: z.boolean().optional(),
  customerIds: z.array(z.number().int().positive()).optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export const generateBatchOutput = z.object({
  generated: z.number().int(),
  skipped: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      reason: z.string(),
    }),
  ),
  invoiceIds: z.array(z.number().int()),
  elapsedMs: z.number(),
})

export const issueInvoiceInput = z.object({
  id: z.number().int().positive(),
  forceClosedPeriod: z.boolean().optional(),
})
export const issueInvoiceOutput = z.object({ item: invoiceDto })

export const voidInvoiceInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1),
  forceClosedPeriod: z.boolean().optional(),
})
export const voidInvoiceOutput = z.object({ item: invoiceDto })

export const issueAllInput = z.object({
  invoiceIds: z.array(z.number().int().positive()).min(1),
  forceClosedPeriod: z.boolean().optional(),
})
export const issueAllOutput = z.object({
  issued: z.number().int(),
  errors: z.array(z.string()),
})

export const listInvoicesInput = z.object({
  period: period.optional(),
  status: invoiceStatusSchema.optional(),
  customerId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  routeId: z.number().int().positive().optional(),
  overdueOnly: z.boolean().optional(),
  minAmount: z.number().int().optional(),
  maxAmount: z.number().int().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().min(0).optional(),
})
export const listInvoicesOutput = z.object({
  items: z.array(invoiceDto),
  total: z.number().int(),
})

export const getInvoiceInput = z.object({ id: z.number().int().positive() })
export const getInvoiceOutput = z.object({ item: invoiceDto })

export const markSharedInput = z.object({
  invoiceIds: z.array(z.number().int().positive()).min(1),
})
export const markSharedOutput = z.object({ count: z.number().int() })

export const listPeriodsOverviewOutput = z.object({
  items: z.array(
    z.object({
      period,
      closed: z.boolean(),
      deliveryCount: z.number().int(),
      invoiceCount: z.number().int(),
      revenue: z.number().int(),
    }),
  ),
})

export const adjustmentKindSchema = z.enum([
  'damaged_bottle',
  'lost_bottle',
  'dispenser_rent',
  'delivery_charge',
  'other_charge',
  'discount',
  'write_off',
  'deposit_received',
  'deposit_refunded',
])

export const adjustmentDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  customerId: z.number().int(),
  adjustmentDate: businessDate,
  kind: adjustmentKindSchema,
  amount: z.number().int(),
  quantity: z.number().int().nullable(),
  description: z.string().nullable(),
  invoiceId: z.number().int().nullable(),
  status: z.enum(['active', 'void']),
  createdAt: z.string(),
  createdBy: z.number().int().nullable(),
  isNonRevenue: z.boolean(),
  sign: z.union([z.literal(1), z.literal(-1)]),
})

export const createAdjustmentInput = z.object({
  customerId: z.number().int().positive(),
  adjustmentDate: businessDate,
  kind: adjustmentKindSchema,
  amount: z.number().int().positive(),
  quantity: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
})
export const createAdjustmentOutput = z.object({ item: adjustmentDto })

export const voidAdjustmentInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1),
})
export const voidAdjustmentOutput = z.object({ item: adjustmentDto })

export const listAdjustmentsInput = z.object({
  customerId: z.number().int().positive(),
  unbilledOnly: z.boolean().optional(),
})
export const listAdjustmentsOutput = z.object({ items: z.array(adjustmentDto) })

export const ledgerRowDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  customerId: z.number().int(),
  entryDate: businessDate,
  entryType: z.string(),
  debit: z.number().int(),
  credit: z.number().int(),
  balanceAfter: z.number().int(),
  description: z.string(),
  refTable: z.string().nullable(),
  refId: z.number().int().nullable(),
  createdAt: z.string(),
  createdBy: z.number().int().nullable(),
  isNonRevenue: z.boolean(),
})

export const getLedgerInput = z.object({
  customerId: z.number().int().positive(),
  from: businessDate.optional(),
  to: businessDate.optional(),
})
export const getLedgerOutput = z.object({ items: z.array(ledgerRowDto) })
