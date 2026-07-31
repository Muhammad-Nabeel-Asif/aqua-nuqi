import { z } from 'zod'
import { SETTING_DEFAULTS, type SettingKey } from '../settings-keys'

const settingKeySchema = z.custom<SettingKey>(
  (v) => typeof v === 'string' && v in SETTING_DEFAULTS,
  'Unknown setting key',
)

export const settingsGetInput = z.object({
  keys: z.array(settingKeySchema).optional(),
})
export const settingsGetOutput = z.object({
  values: z.record(z.string(), z.unknown()),
})
export type SettingsGetInput = z.infer<typeof settingsGetInput>
export type SettingsGetOutput = z.infer<typeof settingsGetOutput>

export const settingsSetManyInput = z.object({
  values: z.record(z.string(), z.unknown()),
})
export const settingsSetManyOutput = z.object({
  values: z.record(z.string(), z.unknown()),
})
export type SettingsSetManyInput = z.infer<typeof settingsSetManyInput>
