import { z } from 'zod'
import { batchFilterSchema } from './billing'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const period = z.string().regex(/^\d{4}-\d{2}$/)

export const printTemplateIdSchema = z.enum([
  'invoice',
  'payment-receipt-a5',
  'payment-receipt-thermal',
  'delivery-slip',
  'customer-statement',
  'delivery-card',
  'bottles-out',
  'receivables',
  'table-export',
])
export type PrintTemplateId = z.infer<typeof printTemplateIdSchema>

export const pageSizeSchema = z.union([
  z.enum(['A4', 'A5', 'Letter']),
  z.object({
    widthMicrons: z.number().positive(),
    heightMicrons: z.number().positive(),
  }),
])
export type PageSizeSpec = z.infer<typeof pageSizeSchema>

/** 80 mm thermal roll — width fixed, long height for content. */
export const THERMAL_80MM_PAGE = {
  widthMicrons: 80_000,
  heightMicrons: 297_000,
} as const

export const generateInvoicePdfInput = z.object({
  invoiceId: z.number().int().positive(),
  openAfter: z.boolean().optional(),
})
export const generateInvoicePdfOutput = z.object({
  path: z.string(),
  invoiceId: z.number().int(),
})

export const batchGeneratePdfsInput = z.object({
  period: period.optional(),
  invoiceIds: z.array(z.number().int().positive()).optional(),
  filter: batchFilterSchema.optional(),
  jobId: z.string().min(1).optional(),
})
export const batchGeneratePdfsOutput = z.object({
  generated: z.number().int(),
  cancelled: z.boolean(),
  folder: z.string(),
  files: z.array(z.string()),
  errors: z.array(z.object({ invoiceId: z.number().int(), message: z.string() })),
  elapsedMs: z.number(),
})

export const cancelBatchPdfInput = z.object({ jobId: z.string().min(1) })
export const cancelBatchPdfOutput = z.object({ ok: z.literal(true) })

export const printInvoiceInput = z.object({
  invoiceId: z.number().int().positive(),
  deviceName: z.string().optional(),
  silent: z.boolean().optional(),
})
export const printInvoiceOutput = z.object({ ok: z.literal(true) })

export const generateReceiptPdfInput = z.object({
  paymentId: z.number().int().positive(),
  variant: z.enum(['a5', 'thermal']).default('a5'),
  openAfter: z.boolean().optional(),
})
export const generateReceiptPdfOutput = z.object({ path: z.string() })

export const generateDeliverySlipInput = z.object({
  deliveryId: z.number().int().positive(),
  openAfter: z.boolean().optional(),
})
export const generateDeliverySlipOutput = z.object({ path: z.string() })

export const generateStatementPdfInput = z.object({
  customerId: z.number().int().positive(),
  from: businessDate.optional(),
  to: businessDate.optional(),
  openAfter: z.boolean().optional(),
})
export const generateStatementPdfOutput = z.object({ path: z.string() })

export const generateDeliveryCardPdfInput = z.object({
  customerId: z.number().int().positive(),
  period,
  openAfter: z.boolean().optional(),
})
export const generateDeliveryCardPdfOutput = z.object({ path: z.string() })

export const generateBottlesOutPdfInput = z.object({
  search: z.string().optional(),
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  minBottles: z.number().int().optional(),
  openAfter: z.boolean().optional(),
})
export const generateBottlesOutPdfOutput = z.object({ path: z.string() })

export const generateReceivablesPdfInput = z.object({
  asOf: businessDate.optional(),
  openAfter: z.boolean().optional(),
})
export const generateReceivablesPdfOutput = z.object({ path: z.string() })

export const exportTableColumnSchema = z.object({
  key: z.string(),
  header: z.string(),
  align: z.enum(['left', 'right', 'center']).optional(),
  width: z.number().optional(),
})

export const exportTableInput = z.object({
  title: z.string().min(1),
  columns: z.array(exportTableColumnSchema).min(1),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
  filters: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  fileName: z.string().optional(),
  openAfter: z.boolean().optional(),
})
export type ExportTableInput = z.infer<typeof exportTableInput>
export const exportTableOutput = z.object({ path: z.string() })

export const exportExcelInput = z.object({
  title: z.string().min(1),
  columns: z.array(exportTableColumnSchema).min(1),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
  sheetName: z.string().optional(),
  fileName: z.string().optional(),
  openAfter: z.boolean().optional(),
})
export type ExportExcelInput = z.infer<typeof exportExcelInput>
export const exportExcelOutput = z.object({ path: z.string() })

export const shareWhatsAppInput = z.object({
  invoiceId: z.number().int().positive(),
  phoneOverride: z.string().optional(),
})
export const shareWhatsAppOutput = z.object({
  ok: z.literal(true),
  waUrl: z.string(),
  pdfPath: z.string().nullable(),
  phoneWarning: z.string().nullable(),
  e164: z.string().nullable(),
})

export const shareEmailInput = z.object({
  invoiceId: z.number().int().positive(),
})
export const shareEmailOutput = z.object({
  ok: z.literal(true),
  mailtoUrl: z.string(),
  pdfPath: z.string().nullable(),
})

export const savePdfAsInput = z.object({
  sourcePath: z.string().min(1),
  defaultName: z.string().optional(),
})
export const savePdfAsOutput = z.object({ path: z.string().nullable() })

export const openPdfInput = z.object({ path: z.string().min(1) })
export const openPdfOutput = z.object({ ok: z.literal(true) })

export const showInFolderInput = z.object({ path: z.string().min(1) })
export const showInFolderOutput = z.object({ ok: z.literal(true) })

export const uploadLogoInput = z.object({
  sourcePath: z.string().min(1),
})
export const uploadLogoOutput = z.object({ logoPath: z.string() })

export const getPrintJobInput = z.object({ jobId: z.string().min(1) })
export const getPrintJobOutput = z.object({
  jobId: z.string(),
  template: printTemplateIdSchema,
  payload: z.unknown(),
  pageSize: pageSizeSchema,
  accentColour: z.string(),
})

export const documentReadyInput = z.object({ jobId: z.string().min(1) })
export const documentReadyOutput = z.object({ ok: z.literal(true) })

export const batchProgressEventSchema = z.object({
  jobId: z.string(),
  current: z.number().int(),
  total: z.number().int(),
  invoiceId: z.number().int().optional(),
  fileName: z.string().optional(),
  status: z.enum(['working', 'done', 'cancelled', 'error']),
  message: z.string().optional(),
})
export type BatchProgressEvent = z.infer<typeof batchProgressEventSchema>
