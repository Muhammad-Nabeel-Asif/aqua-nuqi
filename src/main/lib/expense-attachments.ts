import fs from 'node:fs'
import path from 'node:path'
import { newUuid } from '@main/lib/ids'
import { periodFromDate, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'

export const MAX_RECEIPT_WARN_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_EDGE = 2000
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'])

export function attachmentsRoot(userData: string): string {
  return path.join(userData, 'attachments')
}

export function resolveAttachmentAbsolute(userData: string, relativePath: string): string {
  const root = attachmentsRoot(userData)
  const abs = path.resolve(root, relativePath)
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new AppError('VALIDATION_FAILED', 'Invalid attachment path')
  }
  return abs
}

export type PreparedReceipt = {
  buffer: Buffer | null
  destExt: string
  downscaled: boolean
}

/**
 * Validate source and compute destination paths. Caller may supply a resized buffer
 * (from Electron nativeImage in the IPC layer) — services stay Electron-free.
 */
export function copyExpenseReceipt(opts: {
  userData: string
  sourcePath: string
  expenseDate?: string
  prepared?: PreparedReceipt
}): {
  relativePath: string
  absolutePath: string
  warnedLarge: boolean
  downscaled: boolean
} {
  if (!fs.existsSync(opts.sourcePath)) {
    throw new AppError('NOT_FOUND', 'Source file not found')
  }
  const ext = path.extname(opts.sourcePath).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError('VALIDATION_FAILED', 'Receipt must be an image (jpg, png, webp, gif) or PDF')
  }

  const year = periodFromDate(opts.expenseDate ?? todayBusinessDate()).slice(0, 4)
  const dir = path.join(attachmentsRoot(opts.userData), 'expenses', year)
  fs.mkdirSync(dir, { recursive: true })

  const id = newUuid()
  const destExt = opts.prepared?.destExt ?? ext
  const downscaled = opts.prepared?.downscaled ?? false
  const relativePath = path.join('expenses', year, `${id}${destExt}`).replace(/\\/g, '/')
  const absolutePath = path.join(attachmentsRoot(opts.userData), ...relativePath.split('/'))

  if (opts.prepared?.buffer) {
    fs.writeFileSync(absolutePath, opts.prepared.buffer)
  } else {
    fs.copyFileSync(opts.sourcePath, absolutePath)
  }

  const size = fs.statSync(absolutePath).size
  return {
    relativePath,
    absolutePath,
    warnedLarge: size > MAX_RECEIPT_WARN_BYTES,
    downscaled,
  }
}
