import { z } from 'zod'
import { okOutput, userDto } from './common'

export const setupStatusInput = z.object({}).optional().default({})
export const setupStatusOutput = z.object({
  setupRequired: z.boolean(),
  dbPath: z.string(),
  defaultBackupFolder: z.string(),
})
export type SetupStatusOutput = z.infer<typeof setupStatusOutput>

export const setupCompleteInput = z.object({
  businessName: z.string().min(1).max(200),
  address: z.string().max(500).optional().default(''),
  phone: z.string().max(40).optional().default(''),
  currencyCode: z.string().min(1).default('PKR'),
  currencySymbol: z.string().min(1).default('Rs'),
  dateFormat: z.string().min(1).default('dd-MM-yyyy'),
  decimalPlaces: z.number().int().min(0).max(2).default(0),
  backupFolder: z.string().optional().default(''),
  ownerUsername: z.string().min(3).max(64),
  ownerDisplayName: z.string().min(1).max(120),
  ownerPassword: z.string().min(6).max(200),
})
export const setupCompleteOutput = z.object({ user: userDto })
export type SetupCompleteInput = z.infer<typeof setupCompleteInput>

export const setupRestoreInput = z.object({
  backupFilePath: z.string().min(1),
})
export const setupRestoreOutput = okOutput
export type SetupRestoreInput = z.infer<typeof setupRestoreInput>

export const pickFolderInput = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional(),
})
export const pickFolderOutput = z.object({ path: z.string().nullable() })

export const pickFileInput = z.object({
  title: z.string().optional(),
  filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional(),
})
export const pickFileOutput = z.object({ path: z.string().nullable() })
