import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { APP_ID, PRODUCT_NAME } from '@shared/constants'
import { tryGetAppContext } from './app-context'
import { bootstrapApp, shutdownApp } from './bootstrap'
import { startBackupScheduler, stopBackupScheduler } from './ipc/backup-scheduler'
import { registerAllHandlers } from './ipc/register'
import { checkForUpdatesQuietly, configureUpdater, setAutomaticUpdates } from './ipc/updater'
import { configureLogger, log } from './lib/logger'
import {
  assertAppIdentity,
  assertUserDataPath,
  resolveCanonicalUserData,
  resolveDevUserData,
} from './lib/paths'
import { isPortableBuild, resolvePortableUserData } from './lib/portable'
import { showFatalWindow } from './windows/fatal-window'
import { createMainWindow } from './windows/main-window'

function resolveUserDataPath(): string {
  const portableData = resolvePortableUserData()
  const envUserData = process.env.AQUA_NUQI_USER_DATA?.trim()
  if (envUserData) {
    // Explicit override (scripts / E2E / local experiments). Basename must still pass assert.
    return path.resolve(envUserData)
  }
  if (portableData) {
    // Portable builds keep data beside the exe in a clearly labelled folder —
    // never shared with the installed version's Roaming\Aqua Nuqi data.
    return portableData
  }
  if (!app.isPackaged) {
    // `npm run dev` — keep seed/reset data out of the packaged AppImage/Setup folder.
    return resolveDevUserData()
  }
  return resolveCanonicalUserData(app.getPath('appData'))
}

// Force identity before ready — Linux otherwise uses package.json name (aqua-nuqi)
// for userData instead of PRODUCT_NAME ("Aqua Nuqi").
app.setName(PRODUCT_NAME)
app.setPath('userData', resolveUserDataPath())
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// Lock after userData is set so AQUA_NUQI_USER_DATA / portable / dev profiles do not
// collide with each other (or with a running `npm run dev` while E2E uses a temp dir).
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    try {
      assertAppIdentity(app.getName(), undefined, app.getAppPath())
      assertUserDataPath(app.getPath('userData'))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showFatalWindow({ type: 'fatal_path', message })
      return
    }

    // Temporary logger until bootstrap configures userData logs
    configureLogger(path.join(app.getPath('userData'), 'logs'))

    process.on('uncaughtException', (err) => {
      log.error('uncaughtException', err)
    })
    process.on('unhandledRejection', (reason) => {
      log.error('unhandledRejection', reason)
    })

    const result = bootstrapApp()
    if (!result.ok) {
      showFatalWindow(result.fatal, { userData: result.paths?.userData })
      return
    }

    registerAllHandlers()
    app.on('browser-window-created', (_event, win) => {
      win.on('minimize', () => {
        try {
          const live = tryGetAppContext()
          if (!live?.settings.get('security.lockOnMinimise')) return
          if (live.auth.getSession().user) live.auth.lock()
          win.webContents.send('auth:locked', {})
        } catch {
          // ignore
        }
      })
    })
    createMainWindow()
    startBackupScheduler(() => tryGetAppContext())

    const ctx = tryGetAppContext()
    if (ctx && !isPortableBuild()) {
      try {
        const automatic = Boolean(ctx.settings.get('updates.automatic'))
        configureUpdater({
          automatic,
          backupBeforeUpdate: () => {
            const live = tryGetAppContext()
            if (!live) return
            live.backup.createBackup('manual', { skipPrune: true })
          },
        })
        setAutomaticUpdates(automatic)
        if (automatic) {
          void checkForUpdatesQuietly()
        }
      } catch (err) {
        log.warn('Updater init failed (non-fatal)', err)
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })

    app.on('browser-window-blur', (_event, win) => {
      try {
        const live = tryGetAppContext()
        if (!live?.settings.get('security.lockOnMinimise')) return
        if (win.isMinimized() || !win.isFocused()) {
          // lock-on-minimise is handled via minimize event below
        }
      } catch {
        // ignore
      }
    })
  })

  let shuttingDown = false
  const gracefulShutdown = (): void => {
    if (shuttingDown) return
    shuttingDown = true
    stopBackupScheduler()
    shutdownApp()
  }

  app.on('before-quit', () => {
    gracefulShutdown()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      gracefulShutdown()
      app.quit()
    }
  })

  process.on('SIGTERM', () => {
    gracefulShutdown()
    app.quit()
  })
  process.on('SIGINT', () => {
    gracefulShutdown()
    app.quit()
  })
}
