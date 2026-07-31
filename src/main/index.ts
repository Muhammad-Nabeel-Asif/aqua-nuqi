import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { APP_ID, PRODUCT_NAME } from '@shared/constants'
import { bootstrapApp, shutdownApp } from './bootstrap'
import { registerAllHandlers } from './ipc/register'
import { configureLogger, log } from './lib/logger'
import { assertAppIdentity, assertUserDataPath, resolveCanonicalUserData } from './lib/paths'
import { showFatalWindow } from './windows/fatal-window'
import { createMainWindow } from './windows/main-window'

// Single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Force identity before ready — Linux otherwise uses package.json name (aqua-nuqi)
  // for userData instead of PRODUCT_NAME ("Aqua Nuqi").
  app.setName(PRODUCT_NAME)
  app.setPath('userData', resolveCanonicalUserData(app.getPath('appData')))
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID)
  }

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
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  let shuttingDown = false
  const gracefulShutdown = (): void => {
    if (shuttingDown) return
    shuttingDown = true
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
