import { z } from 'zod'

export const integrityIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  category: z.enum([
    'pragma',
    'ledger',
    'balances',
    'stock',
    'invoices',
    'deliveries',
    'attachments',
  ]),
  message: z.string(),
  details: z.string().optional(),
  fixable: z.boolean(),
  fixAction: z.enum(['recalculate_balances', 'none']).optional(),
})

export const integrityCheckInput = z.object({}).optional().default({})
export const integrityCheckOutput = z.object({
  ranAt: z.string(),
  pragmaOk: z.boolean(),
  issues: z.array(integrityIssueSchema),
  tableCounts: z.record(z.number()),
  dbSizeBytes: z.number().int(),
  oldestTransactionDate: z.string().nullable(),
  newestTransactionDate: z.string().nullable(),
})

export const integrityFixInput = z.object({
  fixAction: z.enum(['recalculate_balances']),
})
export const integrityFixOutput = z.object({
  fixed: z.number().int(),
  message: z.string(),
})

export const maintenanceStatsInput = z.object({}).optional().default({})
export const maintenanceStatsOutput = z.object({
  dbSizeBytes: z.number().int(),
  tableCounts: z.record(z.number()),
  oldestTransactionDate: z.string().nullable(),
  newestTransactionDate: z.string().nullable(),
})

export const maintenanceCompactInput = z.object({}).optional().default({})
export const maintenanceCompactOutput = z.object({
  beforeBytes: z.number().int(),
  afterBytes: z.number().int(),
})

export const maintenanceRebuildInput = z.object({}).optional().default({})
export const maintenanceRebuildOutput = z.object({
  updated: z.number().int(),
})
