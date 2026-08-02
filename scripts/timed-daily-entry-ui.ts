/**
 * Phase 2 acceptance #9 — real Daily Entry UI keyboard timing.
 *
 * Boots Electron with an isolated userData, seeds demo customers, opens
 * `/deliveries/daily`, then drives qty digit → Enter for 100 consecutive
 * customers via sendInputEvent (no mouse during the timed portion).
 *
 * Run: npm run timed:daily-entry
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { getAppContext } from '../src/main/app-context'
import { bootstrapApp, shutdownApp } from '../src/main/bootstrap'
import { seedDemoCustomers } from '../src/main/db/seed-demo'
import { registerAllHandlers } from '../src/main/ipc/register'
import { configureLogger } from '../src/main/lib/logger'
import { PRODUCT_NAME } from '../src/shared/constants'

const TARGET = 100
const RESULT_PATH =
  process.env.AQUA_TIMED_RESULT ??
  path.join(process.cwd(), 'docs/phases/.timed-daily-entry-result.json')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor(
  win: BrowserWindow,
  predicateJs: string,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(predicateJs)
    if (ok) return
    await sleep(50)
  }
  throw new Error(`Timeout waiting for: ${label}`)
}

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-timed-'))
  const userData = path.join(root, PRODUCT_NAME)
  fs.mkdirSync(userData, { recursive: true })

  app.setName(PRODUCT_NAME)
  app.setPath('userData', userData)

  await app.whenReady()
  configureLogger(path.join(userData, 'logs'))

  const boot = bootstrapApp()
  if (!boot.ok) {
    throw new Error(`Bootstrap failed: ${JSON.stringify(boot.fatal)}`)
  }

  registerAllHandlers()
  const ctx = getAppContext()

  // First-run setup (owner) without the wizard UI
  ctx.settings.setMany(
    {
      'business.name': 'Timed Entry Plant',
      'backup.folder': ctx.paths.backupsDir,
    },
    { allowOwnerOnly: true },
  )
  await ctx.auth.createUser({
    username: 'owner',
    displayName: 'Owner',
    password: 'secret12',
    role: 'owner',
  })
  ctx.setupRequired = false

  const seed = await seedDemoCustomers(ctx.db, {
    audit: ctx.audit,
    period: ctx.period,
    rate: ctx.rates,
    balance: ctx.balances,
    userId: null,
  })
  console.log('[timed-daily-entry] seed', seed)

  // Prefer built renderer; fall back to ELECTRON_RENDERER_URL if set by electron-vite.
  if (!process.env.ELECTRON_RENDERER_URL) {
    const rendererHtml = path.join(process.cwd(), 'out/renderer/index.html')
    if (!fs.existsSync(rendererHtml)) {
      throw new Error('Build missing — run npm run build first (out/renderer/index.html)')
    }
  }

  // Point __dirname-relative preload/renderer at out/ by running against built main pieces.
  // createMainWindow uses __dirname from the compiled main bundle when imported via tsx from
  // src — override by setting ELECTRON_RENDERER_URL to file URL if needed.
  const rendererIndex = path.join(process.cwd(), 'out/renderer/index.html')
  const preloadPath = path.join(process.cwd(), 'out/preload/index.js')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    title: 'Aqua Nuqi — timed daily entry',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  await win.loadFile(rendererIndex)
  await waitFor(win, `Boolean(window.api)`, 15_000, 'preload api')

  // Establish main-process session, then reload so App.tsx picks it up via auth:session.
  await win.webContents.executeJavaScript(`
    (async () => {
      const login = await window.api.invoke('auth:login', {
        username: 'owner',
        password: 'secret12',
      })
      if (!login.ok) throw new Error(JSON.stringify(login.error))
      return true
    })()
  `)
  await win.reload()
  await waitFor(win, `Boolean(window.api)`, 15_000, 'preload after reload')

  await waitFor(
    win,
    `(async () => {
      const s = await window.api.invoke('auth:session', {})
      return s.ok && Boolean(s.data.user)
    })()`,
    15_000,
    'authenticated session',
  )

  await win.webContents.executeJavaScript(`location.hash = '#/deliveries/daily'`)
  await sleep(300)
  // Hash change after first paint — nudge router again if still on login/dashboard
  await win.webContents.executeJavaScript(`location.hash = '#/deliveries/daily'`)

  await waitFor(
    win,
    `document.querySelectorAll('input[data-delivery-cell="qty"]').length > 0`,
    30_000,
    'daily qty cells',
  )

  const rowCount = (await win.webContents.executeJavaScript(`
    (async () => {
      const list = await window.api.invoke('deliveries:getDayList', {
        date: new Date().toISOString().slice(0, 10),
      })
      if (!list.ok) throw new Error(list.error.message)
      return list.data.items.length
    })()
  `)) as number

  console.log(`[timed-daily-entry] day list customers: ${rowCount}`)
  if (rowCount < TARGET) {
    throw new Error(`Need ≥${TARGET} customers on daily list, got ${rowCount}`)
  }

  // Focus first qty cell (mouse allowed only before timer)
  await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('input[data-delivery-cell="qty"][data-row-index="0"]')
        || document.querySelector('input[data-delivery-cell="qty"]')
      if (!el) throw new Error('No qty cell')
      el.focus()
      return true
    })()
  `)

  await waitFor(
    win,
    `document.activeElement?.getAttribute?.('data-delivery-cell') === 'qty'`,
    5_000,
    'qty focus',
  )

  const sendKey = (keyCode: string): void => {
    const send = (payload: { type: string; keyCode: string }) => {
      win.webContents.sendInputEvent(
        payload as Parameters<typeof win.webContents.sendInputEvent>[0],
      )
    }
    send({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) send({ type: 'char', keyCode })
    send({ type: 'keyUp', keyCode })
  }

  const t0 = performance.now()
  for (let i = 0; i < TARGET; i++) {
    // Ensure focus is on the expected qty row before keying (keyboard path only)
    await waitFor(
      win,
      `document.activeElement?.getAttribute?.('data-delivery-cell') === 'qty'
        && document.activeElement?.getAttribute?.('data-row-index') === '${i}'`,
      10_000,
      `focus row ${i}`,
    )

    sendKey('2')
    await sleep(20)
    sendKey('Enter')

    if (i < TARGET - 1) {
      await waitFor(
        win,
        `document.activeElement?.getAttribute?.('data-delivery-cell') === 'qty'
          && document.activeElement?.getAttribute?.('data-row-index') === '${i + 1}'`,
        10_000,
        `advance to row ${i + 1}`,
      )
    } else {
      // Last row: wait until save finished (value present or brief settle)
      await sleep(200)
    }
  }
  const elapsedMs = performance.now() - t0
  const elapsedSec = elapsedMs / 1000
  const elapsedMin = elapsedMs / 60_000

  const result = {
    criterion: 9,
    screen: '/deliveries/daily',
    customersEntered: TARGET,
    dayListCustomers: rowCount,
    filter: 'none (all routes / all areas)',
    date: new Date().toISOString().slice(0, 10),
    measuredAt: new Date().toISOString(),
    elapsedMs: Math.round(elapsedMs),
    elapsedSeconds: Number(elapsedSec.toFixed(2)),
    elapsedMinutes: Number(elapsedMin.toFixed(3)),
    underFourMinutes: elapsedMs < 4 * 60 * 1000,
    method:
      'Electron BrowserWindow + sendInputEvent digit→Enter; no mouse during timed loop; seeded demo data',
    seed,
  }

  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true })
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2))
  console.log('[timed-daily-entry] RESULT', result)

  if (!result.underFourMinutes) {
    throw new Error(
      `FAILED criteria #9: ${result.elapsedMinutes} min (≥ 4). Fix daily-entry interaction.`,
    )
  }

  win.close()
  shutdownApp()
  app.exit(0)
}

main().catch((err) => {
  console.error('[timed-daily-entry] FAILED', err)
  try {
    shutdownApp()
  } catch {
    // ignore
  }
  app.exit(1)
})
