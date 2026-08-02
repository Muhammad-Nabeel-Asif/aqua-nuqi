import { describe, expect, it } from 'vitest'
import { UPDATER_INSTALL_POLICY } from './updater-policy'

describe('updater install policy', () => {
  it('never auto-installs on quit (backup runs only via quitAndInstall)', () => {
    expect(UPDATER_INSTALL_POLICY.autoInstallOnAppQuit).toBe(false)
  })

  it('never offers pre-release builds on the stable channel', () => {
    expect(UPDATER_INSTALL_POLICY.allowPrerelease).toBe(false)
    expect(UPDATER_INSTALL_POLICY.channel).toBe('latest')
  })
})
