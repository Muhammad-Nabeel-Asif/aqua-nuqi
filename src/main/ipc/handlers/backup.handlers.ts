import { getAppContext } from '@main/app-context'
import {
  backupCreateInput,
  backupCreateOutput,
  backupListInput,
  backupListOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerBackupHandlers(): void {
  defineHandler({
    channel: 'backup:create',
    input: backupCreateInput,
    output: backupCreateOutput,
    roles: ['owner'],
    handler: (input) => {
      const result = getAppContext().backup.createBackup(input.kind)
      getAppContext().audit.record({
        userId: getAppContext().auth.getSession().user?.id,
        action: 'backup',
        summary: `Created ${input.kind} backup`,
        after: result,
      })
      return result
    },
  })

  defineHandler({
    channel: 'backup:list',
    input: backupListInput,
    output: backupListOutput,
    roles: ['owner'],
    handler: () => getAppContext().backup.listBackups(),
  })
}
