/**
 * Launch the Linux packaged app with an isolated AQUA_NUQI_USER_DATA tree and
 * assert first-run setup is shown. Never touches ~/.config/Aqua Nuqi.
 *
 * GitHub-hosted runners often lack FUSE, so Playwright cannot launch the
 * AppImage directly. This checks that an AppImage was built, then launches
 * release/linux-unpacked (the real Electron binary).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

function requireAppImage(): void {
  const release = path.join(process.cwd(), 'release')
  if (!fs.existsSync(release)) {
    throw new Error('release/ is missing — run npm run dist:linux first')
  }
  const matches = fs.readdirSync(release).filter((name) => name.endsWith('.AppImage'))
  if (matches.length === 0) {
    throw new Error('No AppImage found under release/')
  }
}

function findUnpackedLinux(): string {
  const dir = path.join(process.cwd(), 'release', 'linux-unpacked')
  if (!fs.existsSync(dir)) {
    throw new Error(`Packaged Linux dir missing: ${dir}`)
  }
  const candidates = ['aqua-nuqi', 'Aqua Nuqi']
  for (const name of candidates) {
    const exe = path.join(dir, name)
    if (fs.existsSync(exe)) return exe
  }
  const files = fs.readdirSync(dir).filter((name) => {
    const st = fs.statSync(path.join(dir, name))
    return st.isFile() && (st.mode & 0o111) !== 0 && !name.endsWith('.so')
  })
  if (files[0]) return path.join(dir, files[0])
  throw new Error(`No executable in ${dir}: ${fs.readdirSync(dir).join(', ')}`)
}

function envRecord(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  return env
}

async function main(): Promise<void> {
  requireAppImage()
  const exe = findUnpackedLinux()
  fs.chmodSync(exe, 0o755)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-smoke-linux-'))
  const userData = path.join(root, 'Aqua Nuqi')
  fs.mkdirSync(userData, { recursive: true })

  const env = envRecord()
  env.AQUA_NUQI_USER_DATA = userData
  env.CI = '1'

  const app = await electron.launch({
    executablePath: exe,
    args: ['--no-sandbox'],
    env,
    timeout: 90_000,
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction('Boolean(window.api)', undefined, { timeout: 45_000 })
    const hash = (await page.evaluate('location.hash')) as string
    const body = (await page.evaluate('document.body.innerText')) as string
    if (!hash.includes('#/setup') && !body.includes('Set up a new business')) {
      throw new Error(`Expected first-run setup, hash=${hash} body=${body.slice(0, 400)}`)
    }
    console.log('✓ Packaged Linux app launched with isolated userData; first-run setup visible')
  } finally {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
