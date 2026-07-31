import { eq } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { settings } from '@main/db/schema'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import {
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingValue,
  isOwnerOnlySetting,
} from '@shared/settings-keys'
import type { AuditService } from './audit.service'

export function createSettingsService(db: AppDatabase, audit?: AuditService) {
  function get<K extends SettingKey>(key: K): SettingValue<K> {
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    if (!row) {
      return SETTING_DEFAULTS[key]
    }
    try {
      return JSON.parse(row.value) as SettingValue<K>
    } catch {
      return SETTING_DEFAULTS[key]
    }
  }

  function getMany(keys?: SettingKey[]): Record<string, unknown> {
    const selected = keys ?? (Object.keys(SETTING_DEFAULTS) as SettingKey[])
    const out: Record<string, unknown> = {}
    for (const key of selected) {
      out[key] = get(key)
    }
    return out
  }

  function setMany(
    values: Record<string, unknown>,
    opts: { userId?: number | null; allowOwnerOnly?: boolean } = {},
  ): Record<string, unknown> {
    // Default false: privileged keys require an explicit allowOwnerOnly: true.
    const allowOwnerOnly = opts.allowOwnerOnly === true
    const now = nowIsoUtc()
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    for (const key of Object.keys(values)) {
      if (!(key in SETTING_DEFAULTS)) {
        throw new AppError('VALIDATION_FAILED', `Unknown setting key: ${key}`)
      }
      if (isOwnerOnlySetting(key) && !allowOwnerOnly) {
        throw new AppError('FORBIDDEN', `Setting ${key} requires owner role`)
      }
    }

    db.transaction((tx) => {
      for (const [key, value] of Object.entries(values)) {
        const typedKey = key as SettingKey
        const existing = tx.select().from(settings).where(eq(settings.key, key)).get()
        before[key] = existing
          ? (JSON.parse(existing.value) as unknown)
          : SETTING_DEFAULTS[typedKey]

        if (existing) {
          tx.update(settings)
            .set({ value: JSON.stringify(value), updatedAt: now })
            .where(eq(settings.key, key))
            .run()
        } else {
          tx.insert(settings)
            .values({ key, value: JSON.stringify(value), updatedAt: now })
            .run()
        }
        after[key] = value
      }

      audit?.record(
        {
          userId: opts.userId,
          action: 'settings_change',
          entityTable: 'settings',
          summary: `Updated settings: ${Object.keys(values).join(', ')}`,
          before,
          after,
        },
        tx,
      )
    })

    return getMany(Object.keys(values) as SettingKey[])
  }

  return { get, getMany, setMany }
}

export type SettingsService = ReturnType<typeof createSettingsService>
