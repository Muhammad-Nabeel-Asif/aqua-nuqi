import path from 'node:path'
import { getAppContext } from '@main/app-context'
import type { AuditAction } from '@shared/constants'
import {
  auditArchiveInput,
  auditArchiveOutput,
  auditExportInput,
  auditExportOutput,
  auditListInput,
  auditListOutput,
  auditRetentionApplyInput,
  auditRetentionApplyOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerAuditHandlers(): void {
  defineHandler({
    channel: 'audit:list',
    input: auditListInput,
    output: auditListOutput,
    roles: ['owner'],
    handler: (input) =>
      getAppContext().audit.list({
        from: input.from,
        to: input.to,
        userId: input.userId,
        action: input.action as AuditAction | undefined,
        entityTable: input.entityTable,
        search: input.search,
        limit: input.limit,
        offset: input.offset,
      }),
  })

  defineHandler({
    channel: 'audit:export',
    input: auditExportInput,
    output: auditExportOutput,
    roles: ['owner'],
    handler: (input, ipcCtx) => {
      const ctx = getAppContext()
      const filePath = ctx.audit.exportExcel(
        {
          from: input.from,
          to: input.to,
          userId: input.userId,
          action: input.action as AuditAction | undefined,
          entityTable: input.entityTable,
          search: input.search,
        },
        input.destinationFolder,
      )
      ctx.audit.record({
        userId: ipcCtx.userId,
        action: 'export',
        summary: 'Exported audit log (excel)',
        after: { filePath },
      })
      return { filePath }
    },
  })

  defineHandler({
    channel: 'audit:archive',
    input: auditArchiveInput,
    output: auditArchiveOutput,
    roles: ['owner'],
    handler: (input, ipcCtx) => {
      const result = getAppContext().audit.archiveOlderThan(
        input.olderThanYears,
        input.destinationFolder,
      )
      getAppContext().audit.record({
        userId: ipcCtx.userId,
        action: 'export',
        summary: `Archived ${result.archivedCount} audit entries older than ${input.olderThanYears} years`,
        after: result,
      })
      return result
    },
  })

  defineHandler({
    channel: 'audit:applyRetention',
    input: auditRetentionApplyInput,
    output: auditRetentionApplyOutput,
    roles: ['owner'],
    handler: (_input, ipcCtx) => {
      const ctx = getAppContext()
      const years = Number(ctx.settings.get('audit.retentionYears') || 0)
      if (!years || years <= 0) {
        return { ok: true as const, archivedCount: 0, archivePath: null }
      }
      const dest = path.join(ctx.paths.backupsDir, 'audit-archives')
      const result = ctx.audit.archiveOlderThan(years, dest)
      ctx.audit.record({
        userId: ipcCtx.userId,
        action: 'export',
        summary: `Applied audit retention (${years} years): archived ${result.archivedCount}`,
        after: result,
      })
      return {
        ok: true as const,
        archivedCount: result.archivedCount,
        archivePath: result.archivePath,
      }
    },
  })
}
