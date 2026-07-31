#!/usr/bin/env node
/**
 * Generate GitHub Release body for Aqua Nuqi.
 * Usage: npx tsx scripts/release-notes.ts <version> [--prerelease]
 *        node scripts/release-notes.mjs <version> [--prerelease]
 *
 * Note preference:
 * 1. ## [version] section matching this build (after a stable ships, move notes here)
 * 2. ## [Unreleased] — stable channel only (so stale bullets cannot pollute dig builds)
 * 3. Filtered commit subjects since the previous tag
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReleaseNotes } from './release-notes-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const version = process.argv[2] || '0.0.0'
const isPrerelease =
  process.argv.includes('--prerelease') ||
  process.env.PRERELEASE === 'true' ||
  process.env.PRERELEASE === '1'

function previousTag(): string | null {
  try {
    return execSync('git describe --tags --abbrev=0', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function commitSubjectsSince(tag: string | null): string[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const out = execSync(`git log ${range} --pretty=format:%s`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return []
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^(chore|ci|docs)(\(.*\))?:/i.test(s))
  } catch {
    return []
  }
}

const changelogPath = path.join(root, 'docs', 'CHANGELOG.md')
const changelogText = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : ''

const tag = previousTag()
const subjects = commitSubjectsSince(tag)

process.stdout.write(
  buildReleaseNotes({
    changelogText,
    version,
    isPrerelease,
    commitSubjects: subjects,
  }),
)
