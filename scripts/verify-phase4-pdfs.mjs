/**
 * Headless Phase 4 PDF acceptance checks (printToPDF + Urdu + thermal size).
 * Writes under /tmp to avoid Electron load quirks with spaces in the project path.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-phase4-pdf-'))
const mirrorDir = path.join(root, 'docs/phases/.phase4-pdf-verify')
fs.mkdirSync(mirrorDir, { recursive: true })

const runner = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const outDir = process.env.PHASE4_OUT;
const fontRegular = process.env.PHASE4_FONT_SANS;
const fontUrdu = process.env.PHASE4_FONT_URDU;
const resultPath = path.join(outDir, 'result.json');

function writeResult(obj) {
  fs.writeFileSync(resultPath, JSON.stringify(obj, null, 2));
}

function toFileUrl(p) {
  return 'file://' + encodeURI(path.resolve(p).replace(/\\\\/g, '/'));
}

function buildHtml(lineCount, title) {
  const urdu = 'علی خان';
  const rows = Array.from({ length: lineCount }, (_, i) => {
    const day = String((i % 28) + 1).padStart(2, '0');
    return '<tr><td>' + (i + 1) + '</td><td>2026-07-' + day +
      '</td><td>19 L Bottle</td><td class="num">2</td><td class="num">Rs 60</td><td class="num">Rs 120</td></tr>';
  }).join('');
  return \`<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face { font-family: 'Noto Sans'; src: url('\${toFileUrl(fontRegular)}'); }
@font-face { font-family: 'Noto Nastaliq Urdu'; src: url('\${toFileUrl(fontUrdu)}'); }
body { font-family: 'Noto Sans', 'Noto Nastaliq Urdu', sans-serif; font-size: 11px; }
.customer-name { font-family: 'Noto Nastaliq Urdu', 'Noto Sans', sans-serif; font-size: 16px; font-weight: bold; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #ccc; padding: 3px; }
thead { display: table-header-group; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.total { font-size: 18px; font-weight: bold; color: #0284c7; }
</style></head><body>
<h1>\${title}</h1>
<div class="customer-name" lang="ur">\${urdu}</div>
<table><thead><tr><th>#</th><th>Date</th><th>Description</th><th>Units</th><th>Rate</th><th>Amount</th></tr></thead>
<tbody>\${rows}</tbody></table>
<p class="total">TOTAL PAYABLE Rs 3,700</p>
<p>Rupees Three Thousand Seven Hundred Only</p>
</body></html>\`;
}

app.whenReady().then(async () => {
  const results = { checks: [], errors: [] };
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1400,
    webPreferences: { sandbox: false, webSecurity: false },
  });
  try {
    async function render(html, fileName, pageSize) {
      const htmlPath = path.join(outDir, fileName.replace('.pdf', '.html'));
      fs.writeFileSync(htmlPath, html, 'utf8');
      await win.loadFile(htmlPath);
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
      await new Promise((r) => setTimeout(r, 250));
      const buf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize,
        margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.45, right: 0.45 },
      });
      const dest = path.join(outDir, fileName);
      fs.writeFileSync(dest, buf);
      return { dest, buf };
    }

    const onePage = await render(buildHtml(26, 'INVOICE 26 lines'), 'invoice-26.pdf', 'A4');
    results.checks.push({ name: 'invoice-26-exists', pass: fs.existsSync(onePage.dest), size: onePage.buf.length });

    const multi = await render(buildHtml(60, 'INVOICE 60 lines'), 'invoice-60.pdf', 'A4');
    results.checks.push({ name: 'invoice-60-exists', pass: fs.existsSync(multi.dest), size: multi.buf.length });
    results.checks.push({ name: 'invoice-60-larger-or-equal', pass: multi.buf.length >= onePage.buf.length });

    const thermalHtml = \`<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face { font-family: 'Noto Nastaliq Urdu'; src: url('\${toFileUrl(fontUrdu)}'); }
body{font-family:'Noto Nastaliq Urdu',sans-serif;font-size:10px;width:72mm}
</style></head>
<body><h1>PAYMENT RECEIPT</h1><div lang="ur">علی خان</div>
<p>Amount: Rs 1,250</p><p>Rupees One Thousand Two Hundred Fifty Only</p></body></html>\`;
    const thermal = await render(thermalHtml, 'receipt-80mm.pdf', { width: 80000, height: 200000 });
    results.checks.push({ name: 'thermal-80mm-exists', pass: fs.existsSync(thermal.dest), size: thermal.buf.length });

    // Text extraction is done by the parent via pdftotext (CID fonts hide strings in the PDF binary).
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

// Copy fonts into /tmp so @font-face paths have no spaces
const fontDir = path.join(outDir, 'fonts')
fs.mkdirSync(fontDir, { recursive: true })
const sans = path.join(fontDir, 'NotoSans-Regular.ttf')
const urdu = path.join(fontDir, 'NotoNastaliqUrdu-Regular.ttf')
fs.copyFileSync(path.join(root, 'resources/fonts/NotoSans-Regular.ttf'), sans)
fs.copyFileSync(path.join(root, 'resources/fonts/NotoNastaliqUrdu-Regular.ttf'), urdu)

const child = spawn(electronPath, [tmp], {
  env: {
    ...process.env,
    PHASE4_OUT: outDir,
    PHASE4_FONT_SANS: sans,
    PHASE4_FONT_URDU: urdu,
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
    const { execFileSync } = require('node:child_process')
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } catch {
    return ''
  }
}
function pdfPages(file) {
  try {
    const { execFileSync } = require('node:child_process')
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
    const { execFileSync } = require('node:child_process')
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
  name: 'invoice-60-two-pages-with-header',
  pass: pages60 >= 2 && /#\s+Date|Description/.test(t60p2) && /TOTAL PAYABLE/.test(t60),
  pages: pages60,
})
result.checks.push({
  name: 'urdu-name-renders',
  pass: /علی/.test(t26),
  sample: t26.split('\n').find((l) => /علی/.test(l)) ?? null,
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
