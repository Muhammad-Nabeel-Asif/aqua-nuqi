import { z } from 'zod'
import { okOutput } from './common'

export const updatesStatusInput = z.object({}).optional().default({})
export const updatesStatusOutput = z.object({
  currentVersion: z.string(),
  channel: z.literal('stable'),
  automatic: z.boolean(),
  checking: z.boolean(),
  updateAvailable: z.boolean(),
  updateDownloaded: z.boolean(),
  availableVersion: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  lastError: z.string().nullable(),
  portable: z.boolean(),
})

export const updatesCheckInput = z.object({}).optional().default({})
export const updatesCheckOutput = updatesStatusOutput

export const updatesInstallInput = z.object({}).optional().default({})
export const updatesInstallOutput = okOutput
