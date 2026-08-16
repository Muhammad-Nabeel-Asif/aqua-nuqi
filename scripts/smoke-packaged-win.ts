/**
 * Launch Windows portable exe with an isolated AQUA_NUQI_USER_DATA tree and assert
 * first-run setup is shown. Never touches %AppData%\Aqua Nuqi.
 *
 * Run after `npm run dist:win`. Not a PR CI gate.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

function findPortableExe(): string {
  const preferred = path.join(process.cwd(), 'release', 'Aqua-Nuqi-Portable.exe')
  if (fs.existsSync(preferred)) return preferred
  const release = path.join(process.cwd(), 'release')
  if (!fs.existsSync(release)) {
    throw new Error('release/ is missing — run npm run dist:win first')
  }
  const matches = fs.readdirSync(release).filter((name) => /^Aqua-Nuqi-Portable\.exe$/i.test(name))
  if (matches.length === 0) {
    throw new Error('Aqua-Nuqi-Portable.exe not found under release/')
  }
  return path.join(release, matches[0]!)
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
  if (process.platform !== 'win32') {
    throw new Error('test:smoke:win must run on Windows after dist:win')
  }
  const exe = findPortableExe()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-smoke-win-'))
  const userData = path.join(root, 'Aqua Nuqi')
  fs.mkdirSync(userData, { recursive: true })

  const env = envRecord()
  env.AQUA_NUQI_USER_DATA = userData
  env.CI = '1'

  const app = await electron.launch({
    executablePath: exe,
    args: ['--no-sandbox'],
    env,
    timeout: 60_000,
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
    console.log('✓ Portable exe launched with isolated userData; first-run setup visible')
  } finally {
    await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
