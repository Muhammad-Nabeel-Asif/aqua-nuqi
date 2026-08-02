import type { BootFatal } from '@main/app-context'
import { DOWNLOAD_LATEST_URL } from '@shared/constants'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fatalCode(fatal: BootFatal): string {
  if (fatal.type === 'app_older_than_data') return 'APP_OLDER_THAN_DATA'
  if (fatal.type === 'migration_failed') return 'MIGRATION_FAILED'
  return 'FATAL_PATH'
}

function fatalDetails(fatal: BootFatal, paths?: { userData?: string }): string {
  const lines = [`Aqua Nuqi fatal error`, `Code: ${fatalCode(fatal)}`]
  if (fatal.type === 'app_older_than_data') {
    lines.push(
      `App version: ${fatal.appVersion}`,
      `Data schema: ${fatal.schemaVersion}`,
      `App supports up to: ${fatal.bundledMax}`,
    )
  } else if (fatal.type === 'migration_failed') {
    lines.push(fatal.message)
    if (fatal.backupPath) lines.push(`Backup: ${fatal.backupPath}`)
  } else {
    lines.push(fatal.message)
  }
  if (paths?.userData) lines.push(`Data folder: ${paths.userData}`)
  return lines.join('\n')
}

/** Pure HTML builder — unit-tested without Electron. */
export function buildFatalHtml(
  fatal: BootFatal,
  paths?: { userData?: string },
): { title: string; html: string } {
  let title = 'Something went wrong'
  let body = ''
  const code = fatalCode(fatal)
  const details = fatalDetails(fatal, paths)
  const detailsAttr = escapeHtml(details)

  if (fatal.type === 'app_older_than_data') {
    title = 'This app is older than your data'
    body = `
      <p>This version of Aqua Nuqi (<strong>${escapeHtml(fatal.appVersion)}</strong>) is older than
      your data, which was created with a newer schema (version ${fatal.schemaVersion};
      this app knows up to ${fatal.bundledMax}).</p>
      <p><strong>Please install the latest version. Your data is safe and has not been changed.</strong></p>
      <p>Data folder: <code>${escapeHtml(paths?.userData ?? '')}</code></p>
      <p class="code">Error code: <code>${escapeHtml(code)}</code></p>
      <p class="actions">
        <a class="btn primary" href="${escapeHtml(DOWNLOAD_LATEST_URL)}">Download latest</a>
        <a class="btn" href="aqua-nuqi-fatal://open-data">Open my data folder</a>
        <a class="btn" href="aqua-nuqi-fatal://copy-details" data-details="${detailsAttr}">Copy details</a>
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
      <p class="code">Error code: <code>${escapeHtml(code)}</code></p>
      <p>Please contact the developer and do not try to open the database with another tool.</p>
      <p class="actions">
        <a class="btn" href="aqua-nuqi-fatal://copy-details" data-details="${detailsAttr}">Copy details</a>
        ${paths?.userData ? `<a class="btn" href="aqua-nuqi-fatal://open-data">Open my data folder</a>` : ''}
      </p>
    `
  } else {
    title = 'Fatal configuration error'
    body = `
      <p>${escapeHtml(fatal.message)}</p>
      <p class="code">Error code: <code>${escapeHtml(code)}</code></p>
      <p class="actions">
        <a class="btn" href="aqua-nuqi-fatal://copy-details" data-details="${detailsAttr}">Copy details</a>
        ${paths?.userData ? `<a class="btn" href="aqua-nuqi-fatal://open-data">Open my data folder</a>` : ''}
      </p>
    `
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Segoe UI", sans-serif; margin: 32px; color: #0f172a; background: #f8fafc; }
  h1 { font-size: 20px; margin: 0 0 16px; color: #0c4a6e; }
  p { line-height: 1.5; }
  code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
  .code { font-size: 13px; color: #64748b; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
  .btn {
    display: inline-block; padding: 10px 16px; border-radius: 6px;
    background: #e2e8f0; color: #0f172a; text-decoration: none; font-weight: 600;
    cursor: pointer; border: none;
  }
  .btn.primary { background: #0369a1; color: #fff; }
  #copy-status { margin-top: 12px; font-size: 13px; color: #047857; display: none; }
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
<p id="copy-status">Details copied to clipboard.</p>
<script>
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href="aqua-nuqi-fatal://copy-details"]') : null;
    if (!a) return;
    e.preventDefault();
    var text = a.getAttribute('data-details') || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        var el = document.getElementById('copy-status');
        if (el) el.style.display = 'block';
      });
    }
  });
</script>
</body></html>`

  return { title, html }
}
