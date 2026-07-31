#!/usr/bin/env node
/**
 * Generate GitHub Release body for Aqua Nuqi.
 * Usage: node scripts/release-notes.mjs <version> [--prerelease]
 * No dependencies — Node builtins only.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const version = process.argv[2] || '0.0.0'
const isPrerelease =
  process.argv.includes('--prerelease') ||
  process.env.PRERELEASE === 'true' ||
  process.env.PRERELEASE === '1'

function readChangelogUnreleased() {
  const changelogPath = path.join(root, 'docs', 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) return ''
  const text = fs.readFileSync(changelogPath, 'utf8')
  const match = text.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|\n## |\s*$)/)
  if (!match) return ''
  const body = match[1].trim()
  if (!body || body === '### Added' || /^###\s+\w+\s*$/.test(body)) {
    // Empty or heading-only — treat as no content if no bullet lines
    if (!/^- /.m.test(body)) return ''
  }
  return body
}

function previousTag() {
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

function commitSubjectsSince(tag) {
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

function installFooter(ver) {
  const built = new Date().toISOString().slice(0, 10)
  return `---
### How to install (Windows)
1. Download **Aqua-Nuqi-Setup.exe** below.
2. Double-click it. If Windows shows a blue "Windows protected your PC" box,
   click **More info** → **Run anyway**.
3. Follow the installer. Your existing data is **not** touched by an update.

Built: ${built} · Version: ${ver}`
}

const parts = []

if (isPrerelease) {
  parts.push('> **Development build — for testing only. Not for the client.**')
  parts.push('')
}

const unreleased = readChangelogUnreleased()
if (unreleased) {
  parts.push('## Changes')
  parts.push('')
  parts.push(unreleased)
  parts.push('')
} else {
  const tag = previousTag()
  const subjects = commitSubjectsSince(tag)
  if (subjects.length > 0) {
    parts.push('## Changes')
    parts.push('')
    for (const subject of subjects) {
      parts.push(`- ${subject}`)
    }
    parts.push('')
  }
}

parts.push(installFooter(version))

process.stdout.write(parts.join('\n').trimEnd() + '\n')
