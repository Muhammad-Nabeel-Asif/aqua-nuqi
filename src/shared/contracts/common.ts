import { z } from 'zod'
import { ROLES } from '../constants'

export const roleSchema = z.enum(ROLES)

export const okOutput = z.object({ ok: z.literal(true) })
export type OkOutput = z.infer<typeof okOutput>

export const userDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  hasPin: z.boolean(),
  lastLoginAt: z.string().nullable(),
})
export type UserDto = z.infer<typeof userDto>
