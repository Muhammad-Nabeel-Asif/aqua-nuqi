/**
 * Bundle + launch the Phase 2 criteria #9 UI keyboard timing harness under Electron.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(root, 'scripts/timed-daily-entry-ui.ts')
const outfile = path.join(root, 'scripts/.timed-daily-entry-ui.bundle.cjs')
const electronBin = path.join(root, 'node_modules/.bin/electron')
const esbuildBin = path.join(root, 'node_modules/.bin/esbuild')

const build = spawnSync(
  esbuildBin,
  [
    entry,
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${outfile}`,
    '--external:electron',
    '--external:better-sqlite3',
    '--external:@node-rs/argon2',
    `--alias:@main=${path.join(root, 'src/main')}`,
    `--alias:@shared=${path.join(root, 'src/shared')}`,
  ],
  { cwd: root, encoding: 'utf8' },
)

if (build.status !== 0) {
  console.error(build.stderr || build.stdout)
  process.exit(build.status ?? 1)
}

if (!fs.existsSync(outfile)) {
  console.error('Bundle missing:', outfile)
  process.exit(1)
}

const run = spawnSync(electronBin, [outfile], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
})
process.exit(run.status ?? 1)
