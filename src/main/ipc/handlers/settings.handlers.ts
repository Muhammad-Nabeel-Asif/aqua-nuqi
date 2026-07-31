import { getAppContext } from '@main/app-context'
import {
  settingsGetInput,
  settingsGetOutput,
  settingsSetManyInput,
  settingsSetManyOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'
import { isOwnerOnlySetting, type SettingKey } from '@shared/settings-keys'
import { defineHandler } from '../router'

export function registerSettingsHandlers(): void {
  defineHandler({
    channel: 'settings:get',
    input: settingsGetInput,
    output: settingsGetOutput,
    roles: 'authenticated',
    handler: (input, ctx) => {
      const values = getAppContext().settings.getMany(input.keys as SettingKey[] | undefined)
      if (ctx.role !== 'owner') {
        for (const key of Object.keys(values)) {
          if (isOwnerOnlySetting(key)) delete values[key]
        }
      }
      return { values }
    },
  })

  defineHandler({
    channel: 'settings:setMany',
    input: settingsSetManyInput,
    output: settingsSetManyOutput,
    roles: 'authenticated',
    handler: (input, ctx) => {
      const keys = Object.keys(input.values)
      const touchesOwnerOnly = keys.some(isOwnerOnlySetting)
      if (touchesOwnerOnly && ctx.role !== 'owner') {
        throw new AppError('FORBIDDEN', 'Only the owner can change these settings')
      }
      const values = getAppContext().settings.setMany(input.values, {
        userId: ctx.userId,
        allowOwnerOnly: ctx.role === 'owner',
      })
      return { values }
    },
  })
}
