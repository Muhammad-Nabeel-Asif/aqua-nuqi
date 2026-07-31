import { z } from 'zod'
import { okOutput, roleSchema, userDto } from './common'

export const loginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
export const loginOutput = z.object({ user: userDto })
export type LoginInput = z.infer<typeof loginInput>
export type LoginOutput = z.infer<typeof loginOutput>

export const unlockInput = z.object({
  password: z.string().optional(),
  pin: z.string().optional(),
})
export const unlockOutput = okOutput
export type UnlockInput = z.infer<typeof unlockInput>

export const logoutInput = z.object({}).optional().default({})
export const logoutOutput = okOutput

export const sessionGetInput = z.object({}).optional().default({})
export const sessionGetOutput = z.object({
  user: userDto.nullable(),
  locked: z.boolean(),
  setupRequired: z.boolean(),
})
export type SessionGetOutput = z.infer<typeof sessionGetOutput>

export const createUserInput = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1).max(120),
  password: z.string().min(6).max(200),
  role: roleSchema,
})
export const createUserOutput = z.object({ user: userDto })
export type CreateUserInput = z.infer<typeof createUserInput>

export const listUsersInput = z.object({}).optional().default({})
export const listUsersOutput = z.object({ items: z.array(userDto) })

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
})
export const changePasswordOutput = okOutput

export const setPinInput = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  password: z.string().min(1),
})
export const setPinOutput = okOutput

export const lockSessionInput = z.object({}).optional().default({})
export const lockSessionOutput = okOutput
