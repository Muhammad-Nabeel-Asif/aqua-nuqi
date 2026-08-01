/**
 * Phase 4 PDF acceptance against the real built renderer print route
 * (`#/print/:template?fixture=…` → InvoiceTemplate / PaymentReceiptTemplate).
 *
 * Requires `npm run build` first. Writes under /tmp; mirrors to docs/phases/.phase4-pdf-verify.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rendererHtml = path.join(root, 'out/renderer/index.html')
if (!fs.existsSync(rendererHtml)) {
  console.error('Missing out/renderer/index.html — run npm run build first')
  process.exit(1)
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-phase4-pdf-'))
const mirrorDir = path.join(root, 'docs/phases/.phase4-pdf-verify')
fs.mkdirSync(mirrorDir, { recursive: true })

const runner = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const outDir = process.env.PHASE4_OUT;
const rendererHtml = process.env.PHASE4_RENDERER_HTML;
const resultPath = path.join(outDir, 'result.json');

function writeResult(obj) {
  fs.writeFileSync(resultPath, JSON.stringify(obj, null, 2));
}

function pdfMediaBoxWidthPts(buf) {
  const s = buf.toString('latin1');
  const m = /\\/MediaBox\\s*\\[\\s*[0-9.]+\\s+[0-9.]+\\s+([0-9.]+)\\s+([0-9.]+)\\s*\\]/.exec(s);
  if (!m) return null;
  return Number(m[1]);
}

app.whenReady().then(async () => {
  const results = { checks: [], errors: [] };
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1400,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: false,
    },
  });
  try {
    async function renderFixture(hashPath, fileName, opts = {}) {
      const url = 'file://' + rendererHtml.replace(/\\\\/g, '/') + '#' + hashPath;
      await win.loadURL(url);
      // Wait for fixture PrintJobPage to mark ready (fonts + images).
      const deadline = Date.now() + 20000;
      let ready = false;
      while (Date.now() < deadline) {
        ready = await win.webContents.executeJavaScript(
          "document.documentElement.dataset.printReady === '1' && !document.body.innerText.includes('Unexpected Application Error') && !document.body.innerText.includes('Preparing document')",
        );
        if (ready) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) {
        const snippet = await win.webContents.executeJavaScript(
          'document.body.innerText.slice(0, 500)',
        );
        throw new Error('Print fixture not ready for ' + hashPath + ': ' + snippet);
      }
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
      await new Promise((r) => setTimeout(r, 200));
      const pdfOpts = {
        printBackground: true,
        preferCSSPageSize: !!opts.preferCSSPageSize,
        displayHeaderFooter: !!opts.pageNumbers,
        margins: {
          marginType: 'custom',
          top: opts.margins?.top ?? 0.35,
          bottom: opts.margins?.bottom ?? (opts.pageNumbers ? 0.55 : 0.35),
          left: opts.margins?.left ?? 0.4,
          right: opts.margins?.right ?? 0.4,
        },
      };
      if (opts.pageSize) pdfOpts.pageSize = opts.pageSize;
      if (opts.pageNumbers) {
        pdfOpts.headerTemplate = '<div></div>';
        pdfOpts.footerTemplate =
          '<div style="font-size:9px;width:100%;text-align:center;color:#64748b;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>';
      }
      const buf = await win.webContents.printToPDF(pdfOpts);
      const dest = path.join(outDir, fileName);
      fs.writeFileSync(dest, buf);
      return { dest, buf, mediaWidth: pdfMediaBoxWidthPts(buf) };
    }

    const onePage = await renderFixture(
      '/print/invoice?fixture=invoice-26',
      'invoice-26.pdf',
      { pageSize: 'A4', pageNumbers: true },
    );
    results.checks.push({
      name: 'invoice-26-exists',
      pass: fs.existsSync(onePage.dest),
      size: onePage.buf.length,
    });

    const multi = await renderFixture(
      '/print/invoice?fixture=invoice-60',
      'invoice-60.pdf',
      { pageSize: 'A4', pageNumbers: true },
    );
    results.checks.push({
      name: 'invoice-60-exists',
      pass: fs.existsSync(multi.dest),
      size: multi.buf.length,
    });

    const thermal = await renderFixture(
      '/print/payment-receipt-thermal?fixture=receipt-thermal',
      'receipt-80mm.pdf',
      {
        preferCSSPageSize: true,
        margins: { top: 0.15, bottom: 0.15, left: 0.12, right: 0.12 },
      },
    );
    results.checks.push({
      name: 'thermal-80mm-exists',
      pass: fs.existsSync(thermal.dest),
      size: thermal.buf.length,
    });
    // 80mm ≈ 226.77 pt; allow 200–260 pt (reject the ~5.76e6 broken MediaBox).
    results.checks.push({
      name: 'thermal-mediabox-width-pts',
      pass: thermal.mediaWidth != null && thermal.mediaWidth >= 200 && thermal.mediaWidth <= 260,
      mediaWidth: thermal.mediaWidth,
    });

    results.outDir = outDir;
    results.ok = results.checks.every((c) => c.pass);
    writeResult(results);
  } catch (err) {
    writeResult({ ok: false, errors: [String(err && err.stack || err)], outDir });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(0);
  }
});
`

const tmp = path.join(os.tmpdir(), `phase4-pdf-verify-${Date.now()}.cjs`)
fs.writeFileSync(tmp, runner)

const child = spawn(electronPath, [tmp], {
  env: {
    ...process.env,
    PHASE4_OUT: outDir,
    PHASE4_RENDERER_HTML: rendererHtml,
    ELECTRON_RUN_AS_NODE: '',
  },
  stdio: 'inherit',
})

await new Promise((resolve, reject) => {
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
})

const result = JSON.parse(fs.readFileSync(path.join(outDir, 'result.json'), 'utf8'))

function pdfText(file) {
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } catch {
    return ''
  }
}
function pdfPages(file) {
  try {
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
    const m = /^Pages:\s+(\d+)/m.exec(info)
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

const t26 = pdfText(path.join(outDir, 'invoice-26.pdf'))
const t60 = pdfText(path.join(outDir, 'invoice-60.pdf'))
const t60p2 = (() => {
  try {
    return execFileSync(
      'pdftotext',
      ['-f', '2', '-l', '2', '-layout', path.join(outDir, 'invoice-60.pdf'), '-'],
      { encoding: 'utf8' },
    )
  } catch {
    return ''
  }
})()
const pages26 = pdfPages(path.join(outDir, 'invoice-26.pdf'))
const pages60 = pdfPages(path.join(outDir, 'invoice-60.pdf'))

result.checks.push({
  name: 'invoice-26-one-page',
  pass: pages26 === 1 && /TOTAL PAYABLE/.test(t26),
  pages: pages26,
})
result.checks.push({
  name: 'invoice-60-paginates-with-header-and-page-numbers',
  pass:
    pages60 >= 2 &&
    /#\s*Date|Description/.test(t60p2) &&
    /TOTAL PAYABLE/.test(t60) &&
    /Page\s+2\s+of\s+2/.test(t60),
  pages: pages60,
  samplePageText: t60.match(/Page\s+\d+\s+of\s+\d+/)?.[0] ?? null,
})
result.checks.push({
  name: 'urdu-name-renders',
  // pdftotext may reorder RTL glyphs; accept Arabic script or the literal name.
  pass: /علی/.test(t26) || /[\u0600-\u06FF]{2,}/.test(t26),
  sample: t26.split('\n').find((l) => /[\u0600-\u06FF]/.test(l)) ?? null,
})
result.checks.push({
  name: 'thermal-receipt-text',
  pass: /PAYMENT RECEIPT/.test(pdfText(path.join(outDir, 'receipt-80mm.pdf'))),
})
result.ok = result.checks.every((c) => c.pass)
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))

for (const name of ['invoice-26.pdf', 'invoice-60.pdf', 'receipt-80mm.pdf', 'result.json']) {
  const src = path.join(outDir, name)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(mirrorDir, name))
}
console.log(JSON.stringify(result, null, 2))
fs.unlinkSync(tmp)
if (!result.ok) {
  console.error('Phase 4 PDF verification FAILED')
  process.exit(1)
}
console.log('Phase 4 PDF verification PASS — mirrored to', mirrorDir)
