import { z } from 'zod'
import { okOutput } from './common'

export const aboutGetInput = z.object({}).optional().default({})
export const aboutGetOutput = z.object({
  appVersion: z.string(),
  schemaVersion: z.number().int(),
  dbPath: z.string(),
  dbSizeBytes: z.number().int(),
  userDataPath: z.string(),
  recentAudit: z.array(
    z.object({
      id: z.number().int(),
      occurredAt: z.string(),
      action: z.string(),
      summary: z.string(),
    }),
  ),
})
export type AboutGetOutput = z.infer<typeof aboutGetOutput>

export const exportDiagnosticsInput = z.object({
  destinationFolder: z.string().min(1),
})
export const exportDiagnosticsOutput = z.object({
  zipPath: z.string(),
})

export const openPathInput = z.object({ path: z.string().min(1) })
export const openPathOutput = okOutput
