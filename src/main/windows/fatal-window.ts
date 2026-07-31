import { BrowserWindow, shell } from 'electron'
import type { BootFatal } from '@main/app-context'
import { buildFatalHtml } from './fatal-html'

export { buildFatalHtml } from './fatal-html'

export function showFatalWindow(fatal: BootFatal, paths?: { userData?: string }): void {
  const win = new BrowserWindow({
    width: 640,
    height: 460,
    resizable: false,
    maximizable: false,
    title: 'Aqua Nuqi — Cannot open',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const { html } = buildFatalHtml(fatal, paths)

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
