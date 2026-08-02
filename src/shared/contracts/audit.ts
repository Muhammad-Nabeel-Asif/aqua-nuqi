import { z } from 'zod'
import { AUDIT_ACTIONS } from '../constants'
import { okOutput } from './common'

export const auditDiffFieldSchema = z.object({
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
})

export const auditEntrySchema = z.object({
  id: z.number().int(),
  occurredAt: z.string(),
  userId: z.number().int().nullable(),
  username: z.string().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  entityTable: z.string().nullable(),
  entityId: z.number().int().nullable(),
  summary: z.string(),
  beforeJson: z.string().nullable(),
  afterJson: z.string().nullable(),
  diff: z.array(auditDiffFieldSchema),
})

export const auditListInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.number().int().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityTable: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(5000).default(200),
  offset: z.number().int().min(0).default(0),
})
export const auditListOutput = z.object({
  items: z.array(auditEntrySchema),
  total: z.number().int(),
})
export type AuditListInput = z.infer<typeof auditListInput>

export const auditExportInput = z.object({
  /** Excel only — structured before/after diffs are clearer in a sheet than PDF. */
  format: z.enum(['excel']),
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.number().int().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityTable: z.string().optional(),
  search: z.string().optional(),
  destinationFolder: z.string().min(1),
})
export const auditExportOutput = z.object({
  filePath: z.string(),
})

export const auditArchiveInput = z.object({
  olderThanYears: z.number().int().min(1).max(50),
  destinationFolder: z.string().min(1),
})
export const auditArchiveOutput = z.object({
  archivedCount: z.number().int(),
  archivePath: z.string(),
})

export const auditRetentionApplyInput = z.object({}).optional().default({})
export const auditRetentionApplyOutput = okOutput.extend({
  archivedCount: z.number().int(),
  archivePath: z.string().nullable(),
})
