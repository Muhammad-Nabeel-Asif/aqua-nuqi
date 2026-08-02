import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { log } from '@main/lib/logger'
import type { PageSizeSpec, PrintTemplateId } from '@shared/contracts/pdf'
import {
  buildPdfPageFooterTemplate,
  PDF_EMPTY_HEADER_TEMPLATE,
  pdfPageNumbersEnabled,
  preferCssPageSize,
  toElectronPageSize,
} from '@shared/print-page-size'

export type PrintJobRecord = {
  jobId: string
  template: PrintTemplateId
  payload: unknown
  pageSize: PageSizeSpec
  accentColour: string
  ready: { resolve: () => void; reject: (err: Error) => void; promise: Promise<void> }
  settled: boolean
}

const jobs = new Map<string, PrintJobRecord>()
let poolWindow: BrowserWindow | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_MS = 60_000
const READY_TIMEOUT_MS = 45_000

function makeDeferred(): {
  resolve: () => void
  reject: (err: Error) => void
  promise: Promise<void>
} {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve, reject, promise }
}

export function registerPrintJob(input: {
  jobId: string
  template: PrintTemplateId
  payload: unknown
  pageSize: PageSizeSpec
  accentColour: string
}): PrintJobRecord {
  const ready = makeDeferred()
  const record: PrintJobRecord = {
    ...input,
    ready,
    settled: false,
  }
  jobs.set(input.jobId, record)
  return record
}

export function getPrintJob(jobId: string): PrintJobRecord | null {
  return jobs.get(jobId) ?? null
}

export function signalDocumentReady(jobId: string): boolean {
  const job = jobs.get(jobId)
  if (!job || job.settled) return false
  job.settled = true
  job.ready.resolve()
  return true
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleDestroy(): void {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    if (poolWindow && !poolWindow.isDestroyed()) {
      log.info('Destroying idle print window pool')
      poolWindow.destroy()
    }
    poolWindow = null
    idleTimer = null
  }, IDLE_MS)
}

async function loadPrintRoute(win: BrowserWindow, hashPath: string): Promise<void> {
  // hashPath like `/print/invoice?jobId=…`
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hashPath}`)
    return
  }
  const file = join(__dirname, '../renderer/index.html')
  const hash = hashPath.startsWith('/') ? hashPath.slice(1) : hashPath
  await win.loadFile(file, { hash })
}

async function getPoolWindow(): Promise<BrowserWindow> {
  clearIdleTimer()
  if (poolWindow && !poolWindow.isDestroyed()) return poolWindow

  poolWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Needed so local logo file:// / data URLs render in print templates.
      webSecurity: true,
    },
  })
  poolWindow.on('closed', () => {
    if (poolWindow?.isDestroyed()) poolWindow = null
  })
  return poolWindow
}

export type RenderPdfOptions = {
  jobId: string
  template: PrintTemplateId
  payload: unknown
  pageSize: PageSizeSpec
  accentColour: string
  margins?: { top?: number; bottom?: number; left?: number; right?: number }
  landscape?: boolean
  /** Printed in the page footer so every page is attributable on its own. */
  footerBusinessName?: string
}

export async function renderTemplateToPdf(opts: RenderPdfOptions): Promise<Buffer> {
  const job = registerPrintJob({
    jobId: opts.jobId,
    template: opts.template,
    payload: opts.payload,
    pageSize: opts.pageSize,
    accentColour: opts.accentColour,
  })

  try {
    const win = await getPoolWindow()
    const hash = `/print/${opts.template}?jobId=${encodeURIComponent(opts.jobId)}`
    await loadPrintRoute(win, hash)

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Print template ready timeout for job ${opts.jobId}`)),
        READY_TIMEOUT_MS,
      )
    })
    await Promise.race([job.ready.promise, timeout])

    const cssPage = preferCssPageSize(opts.pageSize)
    const pageNumbers = pdfPageNumbersEnabled(opts.pageSize)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      // Thermal: prefer CSS `@page { size: 80mm … }` — micron pageSize alone produced a
      // broken MediaBox (~28 m wide) in Chromium/Electron.
      preferCSSPageSize: cssPage,
      ...(cssPage
        ? {}
        : {
            pageSize: toElectronPageSize(opts.pageSize) as 'A4' | 'A5' | 'Letter',
          }),
      landscape: opts.landscape ?? false,
      displayHeaderFooter: pageNumbers,
      ...(pageNumbers
        ? {
            headerTemplate: PDF_EMPTY_HEADER_TEMPLATE,
            footerTemplate: buildPdfPageFooterTemplate(opts.footerBusinessName),
          }
        : {}),
      margins: {
        marginType: 'custom',
        top: opts.margins?.top ?? 0.4,
        // Leave room for the Chromium footer when page numbers are on.
        bottom: opts.margins?.bottom ?? (pageNumbers ? 0.55 : 0.4),
        left: opts.margins?.left ?? 0.45,
        right: opts.margins?.right ?? 0.45,
      },
    })
    return pdf
  } finally {
    jobs.delete(opts.jobId)
    scheduleIdleDestroy()
  }
}

export async function printTemplate(
  opts: RenderPdfOptions & {
    deviceName?: string
    silent?: boolean
  },
): Promise<void> {
  const job = registerPrintJob({
    jobId: opts.jobId,
    template: opts.template,
    payload: opts.payload,
    pageSize: opts.pageSize,
    accentColour: opts.accentColour,
  })

  try {
    const win = await getPoolWindow()
    const hash = `/print/${opts.template}?jobId=${encodeURIComponent(opts.jobId)}`
    await loadPrintRoute(win, hash)

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Print template ready timeout for job ${opts.jobId}`)),
        READY_TIMEOUT_MS,
      )
    })
    await Promise.race([job.ready.promise, timeout])

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: opts.silent ?? false,
          printBackground: true,
          deviceName: opts.deviceName,
          landscape: opts.landscape ?? false,
          pageSize: typeof opts.pageSize === 'string' ? opts.pageSize : undefined,
        },
        (success, failureReason) => {
          if (success) resolve()
          else reject(new Error(failureReason || 'Print failed'))
        },
      )
    })
  } finally {
    jobs.delete(opts.jobId)
    scheduleIdleDestroy()
  }
}

export function destroyPrintPool(): void {
  clearIdleTimer()
  if (poolWindow && !poolWindow.isDestroyed()) poolWindow.destroy()
  poolWindow = null
  jobs.clear()
}
