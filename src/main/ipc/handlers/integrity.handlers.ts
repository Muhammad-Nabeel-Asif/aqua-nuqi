import { getAppContext } from '@main/app-context'
import {
  integrityCheckInput,
  integrityCheckOutput,
  integrityFixInput,
  integrityFixOutput,
  maintenanceCompactInput,
  maintenanceCompactOutput,
  maintenanceRebuildInput,
  maintenanceRebuildOutput,
  maintenanceStatsInput,
  maintenanceStatsOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerIntegrityHandlers(): void {
  defineHandler({
    channel: 'integrity:check',
    input: integrityCheckInput,
    output: integrityCheckOutput,
    roles: ['owner'],
    handler: () => getAppContext().integrity.runCheck(),
  })

  defineHandler({
    channel: 'integrity:fix',
    input: integrityFixInput,
    output: integrityFixOutput,
    roles: ['owner'],
    handler: (input, ipcCtx) => {
      const result = getAppContext().integrity.applyFix(input.fixAction)
      getAppContext().audit.record({
        userId: ipcCtx.userId,
        action: 'update',
        summary: result.message,
        after: result,
      })
      return result
    },
  })

  defineHandler({
    channel: 'maintenance:stats',
    input: maintenanceStatsInput,
    output: maintenanceStatsOutput,
    roles: ['owner'],
    handler: () => getAppContext().integrity.getStats(),
  })

  defineHandler({
    channel: 'maintenance:compact',
    input: maintenanceCompactInput,
    output: maintenanceCompactOutput,
    roles: ['owner'],
    handler: (_input, ipcCtx) => {
      const result = getAppContext().integrity.compactDatabase()
      getAppContext().audit.record({
        userId: ipcCtx.userId,
        action: 'update',
        summary: `Compacted database ${result.beforeBytes} → ${result.afterBytes} bytes`,
        after: result,
      })
      return result
    },
  })

  defineHandler({
    channel: 'maintenance:rebuildSummaries',
    input: maintenanceRebuildInput,
    output: maintenanceRebuildOutput,
    roles: ['owner'],
    handler: (_input, ipcCtx) => {
      const result = getAppContext().integrity.rebuildSummaries()
      getAppContext().audit.record({
        userId: ipcCtx.userId,
        action: 'update',
        summary: `Rebuilt summary tables (${result.updated} customers)`,
        after: result,
      })
      return result
    },
  })
}
