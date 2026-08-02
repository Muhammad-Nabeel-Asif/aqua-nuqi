import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { appIconPath } from '@main/lib/brand-assets'
import { PRODUCT_NAME } from '@shared/constants'

export function createMainWindow(): BrowserWindow {
  // Packaged builds get the icon from electron-builder; setting it explicitly
  // also gives `npm run dev` the real icon instead of the Electron default.
  const icon = appIconPath([app.getAppPath(), process.resourcesPath])

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: PRODUCT_NAME,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
