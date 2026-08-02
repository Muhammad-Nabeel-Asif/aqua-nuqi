import { z } from 'zod'
import { BACKUP_KINDS } from '../constants'
import { okOutput } from './common'

export const backupManifestSchema = z.object({
  formatVersion: z.literal(1),
  appVersion: z.string(),
  schemaVersion: z.number().int(),
  createdAt: z.string(),
  kind: z.enum(BACKUP_KINDS),
  dbFileName: z.string(),
  dbChecksumSha256: z.string(),
  rowCounts: z.record(z.number()),
  encrypted: z.boolean(),
  attachmentFileCount: z.number().int(),
})

export const backupCreateInput = z.object({
  kind: z.enum(BACKUP_KINDS).default('manual'),
  password: z.string().min(1).optional(),
})
export const backupCreateOutput = z.object({
  filePath: z.string(),
  sizeBytes: z.number().int(),
  checksum: z.string(),
  kind: z.enum(BACKUP_KINDS),
  secondaryCopied: z.boolean(),
  secondaryWarning: z.string().nullable(),
  manifest: backupManifestSchema,
})
export type BackupCreateInput = z.infer<typeof backupCreateInput>

export const backupListItemSchema = z.object({
  id: z.number().int(),
  createdAt: z.string(),
  kind: z.enum(BACKUP_KINDS),
  filePath: z.string(),
  sizeBytes: z.number().int().nullable(),
  checksum: z.string().nullable(),
  status: z.enum(['success', 'failed']),
  message: z.string().nullable(),
  exists: z.boolean(),
})

export const backupListInput = z.object({}).optional().default({})
export const backupListOutput = z.object({
  items: z.array(backupListItemSchema),
  lastSuccessAt: z.string().nullable(),
  storageUsedBytes: z.number().int(),
  nextDailyDue: z.boolean(),
  nextWeeklyDue: z.boolean(),
})

export const backupVerifyInput = z.object({
  filePath: z.string().min(1),
  password: z.string().optional(),
})
export const backupVerifyOutput = z.object({
  ok: z.boolean(),
  message: z.string(),
  manifest: backupManifestSchema,
})

export const backupInspectInput = z.object({
  filePath: z.string().min(1),
  password: z.string().optional(),
})
export const backupInspectOutput = z.object({
  filePath: z.string(),
  encrypted: z.boolean(),
  validChecksum: z.boolean(),
  manifest: backupManifestSchema,
})

export const backupRestoreInput = z.object({
  filePath: z.string().min(1),
  password: z.string().optional(),
  /** Must be exactly RESTORE */
  confirmation: z.literal('RESTORE'),
})
export const backupRestoreOutput = z.object({
  ok: z.literal(true),
  restartRequired: z.literal(true),
  preRestorePath: z.string(),
})

export const backupOpenReadonlyInput = z.object({
  filePath: z.string().min(1),
  password: z.string().optional(),
})
export const backupOpenReadonlyOutput = z.object({
  stagingDir: z.string(),
  dbPath: z.string(),
  manifest: backupManifestSchema,
})

export const backupCloseReadonlyInput = z.object({
  stagingDir: z.string().min(1),
})
export const backupCloseReadonlyOutput = okOutput

export const backupStatusInput = z.object({}).optional().default({})
export const backupStatusOutput = z.object({
  lastSuccessAt: z.string().nullable(),
  freshnessHours: z.number(),
  isStale: z.boolean(),
  storageUsedBytes: z.number().int(),
  primaryFolder: z.string(),
  secondaryFolder: z.string(),
  nextDailyDue: z.boolean(),
  nextWeeklyDue: z.boolean(),
  encryptionEnabled: z.boolean(),
  /** True when an encryption password is held in memory for scheduled/exit backups. */
  hasSessionEncryptionPassword: z.boolean(),
  isPortable: z.boolean(),
})

export const backupSetEncryptionPasswordInput = z.object({
  password: z.string().nullable(),
})
export const backupSetEncryptionPasswordOutput = okOutput
