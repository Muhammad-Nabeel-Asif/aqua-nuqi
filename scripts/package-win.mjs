/**
 * Build Windows artefacts (NSIS installer + portable).
 *
 * - On Windows: full electron-builder rebuild + both targets.
 * - On Linux without Wine: win32 native prebuilds + portable `.exe`
 *   (NSIS requires Wine on Linux; Phase 0B windows-latest CI builds the NSIS installer).
 * - On Linux with Wine: both targets.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? root,
    stdio: 'inherit',
    shell: opts.shell ?? false,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...opts.env },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result
}

function hasWine() {
  const r = spawnSync('wine', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

if (process.platform === 'win32') {
  run('npx', ['electron-builder', '--win', '--x64', '--config', 'electron-builder.yml'], {
    shell: true,
  })
  process.exit(0)
}

console.log('Preparing win32 native prebuilds for cross-package…')

run(
  'npx',
  [
    'prebuild-install',
    '--runtime',
    'electron',
    '--target',
    '33.4.11',
    '--arch',
    'x64',
    '--platform',
    'win32',
  ],
  { cwd: path.join(root, 'node_modules', 'better-sqlite3'), shell: true },
)

const tmp = path.join(root, '.tmp', 'win-natives')
fs.mkdirSync(tmp, { recursive: true })
run('npm', ['pack', '@node-rs/argon2-win32-x64-msvc@2.0.2'], { shell: true })
const tgzName = 'node-rs-argon2-win32-x64-msvc-2.0.2.tgz'
if (fs.existsSync(path.join(root, tgzName))) {
  fs.renameSync(path.join(root, tgzName), path.join(tmp, tgzName))
}
run('tar', ['-xzf', path.join(tmp, tgzName), '-C', tmp])
const dest = path.join(root, 'node_modules', '@node-rs', 'argon2-win32-x64-msvc')
fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(path.join(tmp, 'package'), dest, { recursive: true })

const targets = hasWine() ? ['--win', '--x64'] : ['--win', 'portable', '--x64']
if (!hasWine()) {
  console.warn(
    'Wine not found — building the portable Windows .exe only. Install Wine (or use Phase 0B windows-latest CI) for the NSIS Setup.exe.',
  )
}

console.log('Packaging Windows…', targets.join(' '))
run(
  'npx',
  ['electron-builder', ...targets, '--config', 'electron-builder.yml', '-c.npmRebuild=false'],
  { shell: true },
)

console.log('Restoring Electron natives for the host platform…')
run('npx', ['electron-builder', 'install-app-deps'], { shell: true })

const release = path.join(root, 'release')
const artefacts = fs.existsSync(release)
  ? fs.readdirSync(release).filter((f) => f.endsWith('.exe'))
  : []
console.log('Windows artefacts:', artefacts.join(', ') || '(none)')
if (artefacts.length === 0) process.exit(1)
