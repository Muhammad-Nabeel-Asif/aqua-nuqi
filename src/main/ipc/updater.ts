/**
 * electron-updater wiring for the stable channel only.
 * Lives under ipc/ because it imports Electron APIs.
 */
import { BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from '../lib/logger'
import { isPortableBuild } from '../lib/portable'

export type UpdaterStatus = {
  currentVersion: string
  channel: 'stable'
  automatic: boolean
  checking: boolean
  updateAvailable: boolean
  updateDownloaded: boolean
  availableVersion: string | null
  releaseNotes: string | null
  lastError: string | null
  portable: boolean
}

type BackupBeforeUpdate = () => void

let automatic = true
let checking = false
let updateAvailable = false
let updateDownloaded = false
let availableVersion: string | null = null
let releaseNotes: string | null = null
let lastError: string | null = null
let wired = false
let backupBeforeUpdate: BackupBeforeUpdate | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function getUpdaterStatus(): UpdaterStatus {
  return {
    currentVersion: app.getVersion(),
    channel: 'stable',
    automatic,
    checking,
    updateAvailable,
    updateDownloaded,
    availableVersion,
    releaseNotes,
    lastError,
    portable: isPortableBuild(),
  }
}

export function setAutomaticUpdates(enabled: boolean): void {
  automatic = enabled
  autoUpdater.autoDownload = enabled
}

export function configureUpdater(opts: {
  automatic: boolean
  backupBeforeUpdate: BackupBeforeUpdate
}): void {
  automatic = opts.automatic
  backupBeforeUpdate = opts.backupBeforeUpdate

  if (wired) return
  wired = true

  // Stable channel only — never offer pre-release /dev builds to the client.
  autoUpdater.channel = 'latest'
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = automatic
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    checking = true
    lastError = null
    broadcast('updates:status', getUpdaterStatus())
  })

  autoUpdater.on('update-available', (info) => {
    checking = false
    updateAvailable = true
    availableVersion = info.version
    releaseNotes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
          : null
    broadcast('updates:status', getUpdaterStatus())
    broadcast('updates:available', getUpdaterStatus())
  })

  autoUpdater.on('update-not-available', () => {
    checking = false
    updateAvailable = false
    availableVersion = null
    broadcast('updates:status', getUpdaterStatus())
  })

  autoUpdater.on('error', (err) => {
    checking = false
    lastError = err instanceof Error ? err.message : String(err)
    log.warn('Updater error (non-fatal)', lastError)
    broadcast('updates:status', getUpdaterStatus())
  })

  autoUpdater.on('download-progress', (p) => {
    broadcast('updates:progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true
    availableVersion = info.version
    broadcast('updates:status', getUpdaterStatus())
    broadcast('updates:downloaded', getUpdaterStatus())
  })
}

/** Silent check on startup — never blocks boot. */
export async function checkForUpdatesQuietly(): Promise<void> {
  if (isPortableBuild()) return
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    log.warn('Startup update check failed', lastError)
  }
}

export async function checkForUpdatesManual(): Promise<UpdaterStatus> {
  if (isPortableBuild()) {
    lastError = 'Portable builds do not auto-update. Download the latest installer instead.'
    return getUpdaterStatus()
  }
  if (!app.isPackaged) {
    lastError = 'Update checks are only available in packaged builds.'
    return getUpdaterStatus()
  }
  try {
    checking = true
    await autoUpdater.checkForUpdates()
  } catch (err) {
    checking = false
    lastError = err instanceof Error ? err.message : String(err)
  }
  return getUpdaterStatus()
}

/** Take a backup, then quit and install. */
export function quitAndInstall(): void {
  try {
    backupBeforeUpdate?.()
  } catch (err) {
    log.error('Pre-update backup failed', err)
    throw err
  }
  autoUpdater.quitAndInstall(false, true)
}
