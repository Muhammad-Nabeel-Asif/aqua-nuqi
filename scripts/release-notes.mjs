#!/usr/bin/env node
/**
 * Thin launcher so CI can keep calling `node scripts/release-notes.mjs`.
 * Delegates to the TypeScript implementation via tsx (already a devDependency).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const script = path.join(__dirname, 'release-notes.ts')

const result = spawnSync(process.execPath, [tsxCli, script, ...process.argv.slice(2)], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exit(result.status ?? 1)
