import { z } from 'zod'

export const importColumnKeySchema = z.enum([
  'name',
  'type',
  'phone',
  'phone2',
  'whatsapp',
  'address',
  'area',
  'route',
  'rate',
  'billingMode',
  'packageAmount',
  'packageIncludedQty',
  'packageExcessRate',
  'openingBalance',
  'openingBottles',
  'openingAsOf',
  'deposit',
  'joiningDate',
  'notes',
  'code',
  'email',
  'landmark',
  'ignore',
])
export type ImportColumnKey = z.infer<typeof importColumnKeySchema>

export const parseImportFileInput = z.object({
  fileName: z.string(),
  base64: z.string().min(1),
})
export const parseImportFileOutput = z.object({
  headers: z.array(z.string()),
  suggestedMapping: z.record(z.string(), importColumnKeySchema),
  previewRows: z.array(z.array(z.string())),
  totalRows: z.number().int(),
})
export type ParseImportFileOutput = z.infer<typeof parseImportFileOutput>

export const validateImportInput = z.object({
  fileName: z.string(),
  base64: z.string().min(1),
  mapping: z.record(z.string(), importColumnKeySchema),
  createMissingAreas: z.boolean().default(false),
  createMissingRoutes: z.boolean().default(false),
})
export const importRowErrorDto = z.object({
  row: z.number().int(),
  field: z.string().optional(),
  message: z.string(),
})
export const validateImportOutput = z.object({
  validCount: z.number().int(),
  errorCount: z.number().int(),
  errors: z.array(importRowErrorDto),
  unknownAreas: z.array(z.string()),
  unknownRoutes: z.array(z.string()),
  preview: z.array(
    z.object({
      row: z.number().int(),
      name: z.string(),
      phone: z.string().nullable(),
      area: z.string().nullable(),
      route: z.string().nullable(),
      rate: z.number().int().nullable(),
      openingBalance: z.number().int().nullable(),
      openingBottles: z.number().int().nullable(),
    }),
  ),
})
export type ValidateImportOutput = z.infer<typeof validateImportOutput>

export const commitImportInput = validateImportInput
export const commitImportOutput = z.object({
  imported: z.number().int(),
  areasCreated: z.number().int(),
  routesCreated: z.number().int(),
})

export const importTemplateOutput = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
})
