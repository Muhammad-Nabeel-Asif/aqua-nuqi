import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { getAppContext } from '@main/app-context'
import { createZipFromFiles, randomToken } from '@main/lib/zip'
import {
  aboutGetInput,
  aboutGetOutput,
  exportDiagnosticsInput,
  exportDiagnosticsOutput,
  openPathInput,
  openPathOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerDiagnosticsHandlers(): void {
  defineHandler({
    channel: 'about:get',
    input: aboutGetInput,
    output: aboutGetOutput,
    roles: 'authenticated',
    handler: () => {
      const ctx = getAppContext()
      let dbSizeBytes = 0
      try {
        dbSizeBytes = fs.statSync(ctx.paths.dbPath).size
      } catch {
        dbSizeBytes = 0
      }
      return {
        appVersion: ctx.appVersion,
        schemaVersion: ctx.schemaVersion,
        dbPath: ctx.paths.dbPath,
        dbSizeBytes,
        userDataPath: ctx.paths.userData,
        recentAudit: ctx.audit.listRecent(15),
      }
    },
  })

  defineHandler({
    channel: 'diagnostics:export',
    input: exportDiagnosticsInput,
    output: exportDiagnosticsOutput,
    roles: ['owner'],
    handler: (input, ipcCtx) => {
      const ctx = getAppContext()
      const settingsDump = ctx.settings.getMany()
      const redacted: Record<string, unknown> = { ...settingsDump }
      for (const key of Object.keys(redacted)) {
        if (
          key.includes('bank') ||
          key.includes('password') ||
          key.includes('secret') ||
          key.includes('recovery')
        ) {
          redacted[key] = '[redacted]'
        }
      }

      const stats = ctx.integrity.getStats()
      const recentAudit = ctx.audit.list({ limit: 200, offset: 0 })

      const logFiles: { name: string; content: Buffer | string }[] = [
        {
          name: 'settings-redacted.json',
          content: JSON.stringify(redacted, null, 2),
        },
        {
          name: 'about.json',
          content: JSON.stringify(
            {
              appVersion: ctx.appVersion,
              schemaVersion: ctx.schemaVersion,
              dbPath: ctx.paths.dbPath,
              dbSizeBytes: stats.dbSizeBytes,
              rowCounts: stats.tableCounts,
              exportedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
        {
          name: 'row-counts.json',
          content: JSON.stringify(stats.tableCounts, null, 2),
        },
        {
          name: 'audit-recent.json',
          content: JSON.stringify(
            recentAudit.items.map((i) => ({
              id: i.id,
              occurredAt: i.occurredAt,
              userId: i.userId,
              username: i.username,
              action: i.action,
              entityTable: i.entityTable,
              entityId: i.entityId,
              summary: i.summary,
            })),
            null,
            2,
          ),
        },
      ]

      if (fs.existsSync(ctx.paths.logsDir)) {
        for (const name of fs.readdirSync(ctx.paths.logsDir)) {
          const full = path.join(ctx.paths.logsDir, name)
          if (fs.statSync(full).isFile()) {
            logFiles.push({ name: `logs/${name}`, content: fs.readFileSync(full) })
          }
        }
      }

      const zipPath = path.join(
        input.destinationFolder,
        `aqua-nuqi-diagnostics-${randomToken()}.zip`,
      )
      createZipFromFiles(logFiles, zipPath)

      ctx.audit.record({
        userId: ipcCtx.userId,
        action: 'export',
        summary: 'Exported diagnostics package',
        after: { zipPath },
      })

      return { zipPath }
    },
  })

  defineHandler({
    channel: 'diagnostics:reportProblem',
    input: exportDiagnosticsInput,
    output: exportDiagnosticsOutput,
    roles: ['owner'],
    handler: async (input, ipcCtx) => {
      // Same package as diagnostics export, then open the containing folder.
      const ctx = getAppContext()
      const result = await (async () => {
        const settingsDump = ctx.settings.getMany()
        const redacted: Record<string, unknown> = { ...settingsDump }
        for (const key of Object.keys(redacted)) {
          if (key.includes('bank') || key.includes('password') || key.includes('secret')) {
            redacted[key] = '[redacted]'
          }
        }
        const stats = ctx.integrity.getStats()
        const recentAudit = ctx.audit.list({ limit: 200, offset: 0 })
        const files: { name: string; content: Buffer | string }[] = [
          { name: 'settings-redacted.json', content: JSON.stringify(redacted, null, 2) },
          {
            name: 'about.json',
            content: JSON.stringify(
              {
                appVersion: ctx.appVersion,
                schemaVersion: ctx.schemaVersion,
                rowCounts: stats.tableCounts,
                exportedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
          {
            name: 'audit-recent.json',
            content: JSON.stringify(
              recentAudit.items.map((i) => ({
                occurredAt: i.occurredAt,
                action: i.action,
                summary: i.summary,
              })),
              null,
              2,
            ),
          },
        ]
        if (fs.existsSync(ctx.paths.logsDir)) {
          for (const name of fs.readdirSync(ctx.paths.logsDir)) {
            const full = path.join(ctx.paths.logsDir, name)
            if (fs.statSync(full).isFile()) {
              files.push({ name: `logs/${name}`, content: fs.readFileSync(full) })
            }
          }
        }
        const zipPath = path.join(
          input.destinationFolder,
          `aqua-nuqi-problem-report-${randomToken()}.zip`,
        )
        createZipFromFiles(files, zipPath)
        ctx.audit.record({
          userId: ipcCtx.userId,
          action: 'export',
          summary: 'Prepared problem report diagnostics zip',
          after: { zipPath },
        })
        await shell.openPath(input.destinationFolder)
        return { zipPath }
      })()
      return result
    },
  })

  defineHandler({
    channel: 'shell:openPath',
    input: openPathInput,
    output: openPathOutput,
    roles: ['owner'],
    handler: async (input) => {
      await shell.openPath(input.path)
      return { ok: true as const }
    },
  })
}
