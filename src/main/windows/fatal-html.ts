import type { BootFatal } from '@main/app-context'
import { DOWNLOAD_LATEST_URL } from '@shared/constants'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pure HTML builder — unit-tested without Electron. */
export function buildFatalHtml(
  fatal: BootFatal,
  paths?: { userData?: string },
): { title: string; html: string } {
  let title = 'Something went wrong'
  let body = ''

  if (fatal.type === 'app_older_than_data') {
    title = 'This app is older than your data'
    body = `
      <p>This version of Aqua Nuqi (<strong>${escapeHtml(fatal.appVersion)}</strong>) is older than
      your data, which was created with a newer schema (version ${fatal.schemaVersion};
      this app knows up to ${fatal.bundledMax}).</p>
      <p><strong>Please install the latest version. Your data is safe and has not been changed.</strong></p>
      <p>Data folder: <code>${escapeHtml(paths?.userData ?? '')}</code></p>
      <p class="actions">
        <a class="btn primary" href="${escapeHtml(DOWNLOAD_LATEST_URL)}">Download latest</a>
        <a class="btn" href="aqua-nuqi-fatal://open-data">Open my data folder</a>
      </p>
    `
  } else if (fatal.type === 'migration_failed') {
    title = 'Database upgrade failed'
    body = `
      <p>${escapeHtml(fatal.message)}</p>
      ${
        fatal.backupPath
          ? `<p>A pre-migration backup was restored from:<br/><code>${escapeHtml(fatal.backupPath)}</code></p>`
          : ''
      }
      <p>Please contact the developer and do not try to open the database with another tool.</p>
    `
  } else {
    title = 'Fatal configuration error'
    body = `<p>${escapeHtml(fatal.message)}</p>`
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Segoe UI", sans-serif; margin: 32px; color: #0f172a; background: #f8fafc; }
  h1 { font-size: 20px; margin: 0 0 16px; color: #0c4a6e; }
  p { line-height: 1.5; }
  code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
  .btn {
    display: inline-block; padding: 10px 16px; border-radius: 6px;
    background: #e2e8f0; color: #0f172a; text-decoration: none; font-weight: 600;
  }
  .btn.primary { background: #0369a1; color: #fff; }
</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`

  return { title, html }
}
