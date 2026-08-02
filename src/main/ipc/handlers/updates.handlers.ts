import { getAppContext } from '@main/app-context'
import {
  updatesCheckInput,
  updatesCheckOutput,
  updatesInstallInput,
  updatesInstallOutput,
  updatesStatusInput,
  updatesStatusOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'
import {
  checkForUpdatesManual,
  getUpdaterStatus,
  quitAndInstall,
  setAutomaticUpdates,
} from '../updater'

export function registerUpdatesHandlers(): void {
  defineHandler({
    channel: 'updates:status',
    input: updatesStatusInput,
    output: updatesStatusOutput,
    roles: ['owner'],
    handler: () => {
      const automatic = Boolean(getAppContext().settings.get('updates.automatic'))
      setAutomaticUpdates(automatic)
      return { ...getUpdaterStatus(), automatic }
    },
  })

  defineHandler({
    channel: 'updates:check',
    input: updatesCheckInput,
    output: updatesCheckOutput,
    roles: ['owner'],
    handler: async () => {
      const status = await checkForUpdatesManual()
      return {
        ...status,
        automatic: Boolean(getAppContext().settings.get('updates.automatic')),
      }
    },
  })

  defineHandler({
    channel: 'updates:install',
    input: updatesInstallInput,
    output: updatesInstallOutput,
    roles: ['owner'],
    handler: () => {
      quitAndInstall()
      return { ok: true as const }
    },
  })
}
