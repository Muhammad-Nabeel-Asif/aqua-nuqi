import { describe, expect, it } from 'vitest'
import { filterSettingsForRole } from './settings.handlers'

describe('filterSettingsForRole', () => {
  const values = {
    'security.autoLockMinutes': 1,
    'security.lockOnMinimise': true,
    'updates.automatic': true,
    'business.name': 'Aqua Nuqi',
  }

  it('keeps lock settings readable while hiding other owner settings', () => {
    expect(filterSettingsForRole(values, 'viewer')).toEqual({
      'security.autoLockMinutes': 1,
      'security.lockOnMinimise': true,
    })
    expect(values).toHaveProperty('business.name')
  })

  it('returns all settings to the owner', () => {
    expect(filterSettingsForRole(values, 'owner')).toBe(values)
  })
})
