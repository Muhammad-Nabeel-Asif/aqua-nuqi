import { z } from 'zod'
import { okOutput } from './common'

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/)

export const periodIsClosedInput = z.object({ period: periodSchema })
export const periodIsClosedOutput = z.object({ closed: z.boolean() })

export const periodCloseInput = z.object({
  period: periodSchema,
  notes: z.string().max(500).optional(),
})
export const periodCloseOutput = okOutput

export const periodReopenInput = z.object({
  period: periodSchema,
  reason: z.string().min(1).max(500),
})
export const periodReopenOutput = okOutput

export const periodListInput = z.object({}).optional().default({})
export const periodListOutput = z.object({
  items: z.array(
    z.object({
      period: z.string(),
      closedAt: z.string(),
      reopenedAt: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  ),
})
