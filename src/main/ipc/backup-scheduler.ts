import { BrowserWindow } from 'electron'
import type { AppContext } from '@main/app-context'
import { log } from '../lib/logger'

let timer: ReturnType<typeof setInterval> | null = null

function emitProgress(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('backup:progress', payload)
  }
}

export function startBackupScheduler(getCtx: () => AppContext | null): void {
  if (timer) return

  const tick = () => {
    const ctx = getCtx()
    if (!ctx || ctx.setupRequired) return
    try {
      if (ctx.settings.get('backup.daily') && ctx.backup.needsDailyBackup()) {
        log.info('Running scheduled daily backup')
        ctx.backup.createBackup('daily', { onProgress: emitProgress })
      }
      if (ctx.settings.get('backup.weekly') && ctx.backup.needsWeeklyBackup()) {
        log.info('Running scheduled weekly backup')
        ctx.backup.createBackup('weekly', { onProgress: emitProgress })
      }
    } catch (err) {
      log.error('Scheduled backup failed', err)
    }
  }

  // First launch of the day / week — run shortly after boot, then hourly.
  setTimeout(tick, 15_000)
  timer = setInterval(tick, 60 * 60 * 1000)
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
