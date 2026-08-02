import fs from 'node:fs'
import path from 'node:path'
import { log } from './logger'

export type PendingRestoreIntent = {
  from: string
  preRestorePath: string
  at: string
  userId: number | null
}

/** Remove pending-restore.json so a failed/rolled-back restore cannot fake a success audit on boot. */
export function clearPendingRestoreIntent(intentPath: string): void {
  try {
    fs.unlinkSync(intentPath)
  } catch {
    // already gone
  }
}

/**
 * Happy-path finalize: delete pending-restore.json first, then write the restore audit.
 * If audit.record fails after the unlink, rewrite the intent so boot can finish the trail.
 * Ordering avoids a double audit when the process dies between record and unlink.
 */
export function finalizeRestoreAuditAfterSuccess(opts: {
  intentPath: string
  intent: PendingRestoreIntent
  record: (entry: {
    userId: number | null
    action: 'restore'
    summary: string
    after?: Record<string, unknown>
  }) => unknown
}): void {
  clearPendingRestoreIntent(opts.intentPath)
  try {
    opts.record({
      userId: opts.intent.userId,
      action: 'restore',
      summary: `Restored from ${opts.intent.from} (pre_restore: ${opts.intent.preRestorePath})`,
      after: {
        filePath: opts.intent.from,
        preRestorePath: opts.intent.preRestorePath,
      },
    })
  } catch (err) {
    try {
      fs.writeFileSync(opts.intentPath, JSON.stringify(opts.intent), 'utf8')
      log.warn('Restore audit failed after clearing pending-restore.json; intent rewritten', err)
    } catch (rewriteErr) {
      log.error('Failed to rewrite pending-restore.json after audit failure', rewriteErr)
    }
    throw err
  }
}

/** Append restore audit entry if a previous restore crashed before audit.record. */
export function consumePendingRestoreAudit(
  userData: string,
  audit: {
    record: (entry: {
      userId: number | null
      action: 'restore'
      summary: string
      after?: Record<string, unknown>
    }) => unknown
  },
): boolean {
  const intentPath = path.join(userData, 'pending-restore.json')
  if (!fs.existsSync(intentPath)) return false
  try {
    const raw = JSON.parse(fs.readFileSync(intentPath, 'utf8')) as {
      from?: string
      preRestorePath?: string
      at?: string
      userId?: number | null
    }
    audit.record({
      userId: raw.userId ?? null,
      action: 'restore',
      summary: `Restored from ${raw.from ?? 'backup'} (pre_restore: ${raw.preRestorePath ?? 'n/a'}) — finalized after restart`,
      after: {
        filePath: raw.from,
        preRestorePath: raw.preRestorePath,
        pendingAt: raw.at,
      },
    })
    fs.unlinkSync(intentPath)
    log.info('Consumed pending-restore.json and wrote audit entry')
    return true
  } catch (err) {
    log.warn('Failed to consume pending-restore.json', err)
    return false
  }
}
