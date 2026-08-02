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

function escapeFooterHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Electron/Chromium footer for “Page X of Y”, with the business name on the
 * left so every page of a multi-page document is attributable on its own.
 * Body CSS `counter(page)` does not advance under printToPDF, hence the
 * Chromium-provided `pageNumber` / `totalPages` spans.
 */
export function buildPdfPageFooterTemplate(businessName?: string): string {
  const name = businessName?.trim()
  return (
    '<div style="font-size:9px;width:100%;color:#64748b;padding:0 12mm;' +
    'display:flex;justify-content:space-between;align-items:center;">' +
    `<span style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${
      name ? escapeFooterHtml(name) : ''
    }</span>` +
    '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>' +
    '</div>'
  )
}

/** Unbranded default, kept for callers with no business context. */
export const PDF_PAGE_FOOTER_TEMPLATE = buildPdfPageFooterTemplate()

export const PDF_EMPTY_HEADER_TEMPLATE = '<div></div>'

/** Whether displayHeaderFooter page numbers should be enabled for this template size. */
export function pdfPageNumbersEnabled(pageSize: PageSizeSpec): boolean {
  return pageSize === 'A4' || pageSize === 'Letter'
}
