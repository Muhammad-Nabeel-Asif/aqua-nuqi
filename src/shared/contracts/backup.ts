import { z } from 'zod'
import { BACKUP_KINDS } from '../constants'

export const backupCreateInput = z.object({
  kind: z.enum(BACKUP_KINDS).default('manual'),
})
export const backupCreateOutput = z.object({
  filePath: z.string(),
  sizeBytes: z.number().int(),
  checksum: z.string(),
})
export type BackupCreateInput = z.infer<typeof backupCreateInput>

export const backupListInput = z.object({}).optional().default({})
export const backupListOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      createdAt: z.string(),
      kind: z.enum(BACKUP_KINDS),
      filePath: z.string(),
      sizeBytes: z.number().int().nullable(),
      checksum: z.string().nullable(),
      status: z.enum(['success', 'failed']),
      message: z.string().nullable(),
    }),
  ),
  lastSuccessAt: z.string().nullable(),
})
