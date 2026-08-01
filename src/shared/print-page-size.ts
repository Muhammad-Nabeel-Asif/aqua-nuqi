import type { PageSizeSpec } from './contracts/pdf'

/** True when PDF size should come from CSS `@page { size: … }` (thermal rolls). */
export function preferCssPageSize(pageSize: PageSizeSpec): boolean {
  return typeof pageSize !== 'string'
}

/** Map our PageSizeSpec to Electron `printToPDF` / `print` pageSize. */
export function toElectronPageSize(
  pageSize: PageSizeSpec,
): string | { width: number; height: number } {
  if (typeof pageSize === 'string') return pageSize
  return { width: pageSize.widthMicrons, height: pageSize.heightMicrons }
}

/**
 * Electron/Chromium footer template for “Page X of Y”.
 * Body CSS `counter(page)` does not advance under printToPDF.
 */
export const PDF_PAGE_FOOTER_TEMPLATE =
  '<div style="font-size:9px;width:100%;text-align:center;color:#64748b;padding:0 12mm;">' +
  'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'

export const PDF_EMPTY_HEADER_TEMPLATE = '<div></div>'

/** Whether displayHeaderFooter page numbers should be enabled for this template size. */
export function pdfPageNumbersEnabled(pageSize: PageSizeSpec): boolean {
  return pageSize === 'A4' || pageSize === 'Letter'
}
