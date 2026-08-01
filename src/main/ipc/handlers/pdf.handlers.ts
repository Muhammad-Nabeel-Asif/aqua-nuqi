import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import { getPrintJob, signalDocumentReady } from '@main/windows/print-window'
import {
  batchGeneratePdfsInput,
  batchGeneratePdfsOutput,
  cancelBatchPdfInput,
  cancelBatchPdfOutput,
  documentReadyInput,
  documentReadyOutput,
  exportExcelInput,
  exportExcelOutput,
  exportTableInput,
  exportTableOutput,
  generateBottlesOutPdfInput,
  generateBottlesOutPdfOutput,
  generateDeliveryCardPdfInput,
  generateDeliveryCardPdfOutput,
  generateDeliverySlipInput,
  generateDeliverySlipOutput,
  generateInvoicePdfInput,
  generateInvoicePdfOutput,
  generateReceiptPdfInput,
  generateReceiptPdfOutput,
  generateReceivablesPdfInput,
  generateReceivablesPdfOutput,
  generateStatementPdfInput,
  generateStatementPdfOutput,
  getPrintJobInput,
  getPrintJobOutput,
  openPdfInput,
  openPdfOutput,
  printInvoiceInput,
  printInvoiceOutput,
  savePdfAsInput,
  savePdfAsOutput,
  shareEmailInput,
  shareEmailOutput,
  shareWhatsAppInput,
  shareWhatsAppOutput,
  showInFolderInput,
  showInFolderOutput,
  uploadLogoInput,
  uploadLogoOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'

function pdf() {
  return getAppContext().pdf
}

export function registerPdfHandlers(): void {
  defineHandler({
    channel: 'print:getJob',
    input: getPrintJobInput,
    output: getPrintJobOutput,
    roles: 'public',
    handler: (input) => {
      const job = getPrintJob(input.jobId)
      if (!job) throw new AppError('NOT_FOUND', `Print job ${input.jobId} not found`)
      return {
        jobId: job.jobId,
        template: job.template,
        payload: job.payload,
        pageSize: job.pageSize,
        accentColour: job.accentColour,
      }
    },
  })

  defineHandler({
    channel: 'print:documentReady',
    input: documentReadyInput,
    output: documentReadyOutput,
    roles: 'public',
    handler: (input) => {
      signalDocumentReady(input.jobId)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'pdf:generateInvoice',
    input: generateInvoicePdfInput,
    output: generateInvoicePdfOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      pdf().generateInvoicePdf(input.invoiceId, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:batchGenerate',
    input: batchGeneratePdfsInput,
    output: batchGeneratePdfsOutput,
    roles: ['owner', 'operator'],
    handler: async (input, ctx) => {
      const win = BrowserWindow.fromWebContents(ctx.event.sender)
      return pdf()
        .batchGenerateInvoices(
          {
            ...input,
            jobId: input.jobId,
          },
          ctx.userId,
        )
        .then((result) => {
          void win
          return result
        })
    },
  })

  defineHandler({
    channel: 'pdf:cancelBatch',
    input: cancelBatchPdfInput,
    output: cancelBatchPdfOutput,
    roles: ['owner', 'operator'],
    handler: (input) => {
      pdf().cancelBatch(input.jobId)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'pdf:printInvoice',
    input: printInvoiceInput,
    output: printInvoiceOutput,
    roles: ['owner', 'operator'],
    handler: async (input) => {
      await pdf().printInvoice(input.invoiceId, {
        deviceName: input.deviceName,
        silent: input.silent,
      })
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'pdf:generateReceipt',
    input: generateReceiptPdfInput,
    output: generateReceiptPdfOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      pdf().generateReceiptPdf(input.paymentId, input.variant, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:generateDeliverySlip',
    input: generateDeliverySlipInput,
    output: generateDeliverySlipOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      pdf().generateDeliverySlip(input.deliveryId, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:generateStatement',
    input: generateStatementPdfInput,
    output: generateStatementPdfOutput,
    roles: 'authenticated',
    handler: (input, ctx) =>
      pdf().generateStatementPdf(
        input.customerId,
        { from: input.from, to: input.to },
        { openAfter: input.openAfter, userId: ctx.userId },
      ),
  })

  defineHandler({
    channel: 'pdf:generateDeliveryCard',
    input: generateDeliveryCardPdfInput,
    output: generateDeliveryCardPdfOutput,
    roles: 'authenticated',
    handler: (input, ctx) =>
      pdf().generateDeliveryCardPdf(input.customerId, input.period, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:generateBottlesOut',
    input: generateBottlesOutPdfInput,
    output: generateBottlesOutPdfOutput,
    roles: 'authenticated',
    handler: (input, ctx) =>
      pdf().generateBottlesOutPdf(input, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:generateReceivables',
    input: generateReceivablesPdfInput,
    output: generateReceivablesPdfOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      pdf().generateReceivablesPdf(input.asOf, {
        openAfter: input.openAfter,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:exportTable',
    input: exportTableInput,
    output: exportTableOutput,
    roles: 'authenticated',
    handler: (input, ctx) => pdf().exportTable(input, { userId: ctx.userId }),
  })

  defineHandler({
    channel: 'pdf:exportExcel',
    input: exportExcelInput,
    output: exportExcelOutput,
    roles: 'authenticated',
    handler: (input, ctx) => pdf().exportExcel(input, { userId: ctx.userId }),
  })

  defineHandler({
    channel: 'pdf:shareWhatsApp',
    input: shareWhatsAppInput,
    output: shareWhatsAppOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      pdf().shareWhatsApp(input.invoiceId, {
        phoneOverride: input.phoneOverride,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'pdf:shareEmail',
    input: shareEmailInput,
    output: shareEmailOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => pdf().shareEmail(input.invoiceId, { userId: ctx.userId }),
  })

  defineHandler({
    channel: 'pdf:saveAs',
    input: savePdfAsInput,
    output: savePdfAsOutput,
    roles: 'authenticated',
    handler: (input) => pdf().savePdfAs(input.sourcePath, input.defaultName),
  })

  defineHandler({
    channel: 'pdf:open',
    input: openPdfInput,
    output: openPdfOutput,
    roles: 'authenticated',
    handler: async (input) => {
      const err = await shell.openPath(input.path)
      if (err) throw new AppError('INTERNAL', err)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'pdf:showInFolder',
    input: showInFolderInput,
    output: showInFolderOutput,
    roles: 'authenticated',
    handler: (input) => {
      shell.showItemInFolder(input.path)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'pdf:uploadLogo',
    input: uploadLogoInput,
    output: uploadLogoOutput,
    roles: ['owner'],
    handler: (input, ctx) => {
      const appCtx = getAppContext()
      if (!fs.existsSync(input.sourcePath)) {
        throw new AppError('NOT_FOUND', 'Logo file not found')
      }
      const ext = path.extname(input.sourcePath).toLowerCase() || '.png'
      const logosDir = path.join(appCtx.paths.userData, 'logos')
      fs.mkdirSync(logosDir, { recursive: true })
      const dest = path.join(logosDir, `logo${ext}`)
      fs.copyFileSync(input.sourcePath, dest)
      appCtx.settings.setMany(
        { 'business.logoPath': dest },
        { userId: ctx.userId, allowOwnerOnly: true },
      )
      return { logoPath: dest }
    },
  })
}

/** Wire platform adapters that need Electron APIs (called from bootstrap). */
export function createPdfPlatformFromElectron(): {
  getDocumentsRoot: () => string
  openExternal: (url: string) => Promise<void>
  showItemInFolder: (filePath: string) => void
  writeClipboard: (text: string) => void
  openPath: (filePath: string) => Promise<string>
  saveDialog: (opts: {
    defaultPath: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string | null>
  readLogoAsDataUrl: (logoPath: string) => string | null
  emitProgress: (event: import('@shared/contracts/pdf').BatchProgressEvent) => void
} {
  return {
    getDocumentsRoot: () => path.join(app.getPath('documents'), 'AquaNuqi'),
    openExternal: (url) => shell.openExternal(url),
    showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
    writeClipboard: (text) => clipboard.writeText(text),
    openPath: (filePath) => shell.openPath(filePath),
    saveDialog: async (opts) => {
      const win = BrowserWindow.getFocusedWindow()
      const r = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: opts.defaultPath,
            filters: opts.filters,
          })
        : await dialog.showSaveDialog({
            defaultPath: opts.defaultPath,
            filters: opts.filters,
          })
      if (r.canceled || !r.filePath) return null
      return r.filePath
    },
    readLogoAsDataUrl: (logoPath) => {
      try {
        if (!fs.existsSync(logoPath)) return null
        const buf = fs.readFileSync(logoPath)
        const ext = path.extname(logoPath).toLowerCase().replace('.', '') || 'png'
        const mime =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'svg'
              ? 'image/svg+xml'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/png'
        return `data:${mime};base64,${buf.toString('base64')}`
      } catch {
        return null
      }
    },
    emitProgress: (event) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('pdf:batchProgress', event)
      }
    },
  }
}
