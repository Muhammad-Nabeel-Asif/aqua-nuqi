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
  password: z.string().min(8).max(200),
  role: roleSchema,
})
export const createUserOutput = z.object({ user: userDto })
export type CreateUserInput = z.infer<typeof createUserInput>

export const listUsersInput = z.object({}).optional().default({})
export const listUsersOutput = z.object({ items: z.array(userDto) })

export const updateUserInput = z.object({
  userId: z.number().int().positive(),
  displayName: z.string().min(1).max(120).optional(),
  role: roleSchema.optional(),
})
export const updateUserOutput = z.object({ user: userDto })

export const setUserActiveInput = z.object({
  userId: z.number().int().positive(),
  isActive: z.boolean(),
})
export const setUserActiveOutput = z.object({ user: userDto })

export const resetPasswordInput = z.object({
  userId: z.number().int().positive(),
  newPassword: z.string().min(8).max(200),
})
export const resetPasswordOutput = okOutput

export const clearPinInput = z.object({
  userId: z.number().int().positive(),
})
export const clearPinOutput = okOutput

export const forceLogoutInput = z.object({
  userId: z.number().int().positive(),
})
export const forceLogoutOutput = okOutput

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})
export const changePasswordOutput = okOutput

export const setPinInput = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  password: z.string().min(1),
})
export const setPinOutput = okOutput

export const lockSessionInput = z.object({}).optional().default({})
export const lockSessionOutput = okOutput

export const generateRecoveryCodeInput = z.object({}).optional().default({})
export const generateRecoveryCodeOutput = z.object({
  recoveryCode: z.string(),
})

export const resetOwnerWithRecoveryInput = z.object({
  username: z.string().min(1),
  recoveryCode: z.string().min(8),
  newPassword: z.string().min(8).max(200),
})
export const resetOwnerWithRecoveryOutput = z.object({ user: userDto })

export const passwordStrengthInput = z.object({
  password: z.string(),
})
export const passwordStrengthOutput = z.object({
  score: z.number().int().min(0).max(4),
  label: z.enum(['too_short', 'weak', 'fair', 'good', 'strong']),
})
