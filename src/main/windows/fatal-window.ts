import { app, BrowserWindow, shell } from 'electron'
import type { BootFatal } from '@main/app-context'
import { appIconPath, brandLogoDataUrl } from '@main/lib/brand-assets'
import { PRODUCT_NAME } from '@shared/constants'
import { buildFatalHtml } from './fatal-html'

export { buildFatalHtml } from './fatal-html'

export function showFatalWindow(fatal: BootFatal, paths?: { userData?: string }): void {
  // Bootstrap may have failed before app paths resolved, so every brand lookup
  // here must tolerate a null result and fall back to plain text.
  const roots = [app.getAppPath(), process.resourcesPath].filter(Boolean)
  const icon = appIconPath(roots)

  const win = new BrowserWindow({
    width: 640,
    height: 500,
    resizable: false,
    maximizable: false,
    title: `${PRODUCT_NAME} — Cannot open`,
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const { html } = buildFatalHtml(fatal, paths, { logoDataUrl: brandLogoDataUrl(roots) })

  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (url.startsWith('aqua-nuqi-fatal://open-data')) {
      if (paths?.userData) void shell.openPath(paths.userData)
      return
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}
