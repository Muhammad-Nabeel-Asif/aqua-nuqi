/**
 * Pure helpers for GitHub Release body generation (FR-CI-05).
 * Kept free of Node side-effects so unit tests can cover note selection.
 */

export function readChangelogSection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Consume only the heading line (optional "— date"), then capture until the
  // next ## [section]. Do not let \s* eat the blank line before the next heading.
  const match = text.match(new RegExp(`## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`))
  if (!match) return ''
  const body = match[1].trim()
  if (!body) return ''
  // Heading-only (e.g. "### Added" with no bullets) → treat as empty
  if (!/^- /m.test(body)) return ''
  return body
}

export function readChangelogUnreleased(text: string): string {
  return readChangelogSection(text, 'Unreleased')
}

export function installFooter(ver: string, built = new Date().toISOString().slice(0, 10)): string {
  return `---
### How to install (Windows)
1. Download **Aqua-Nuqi-Setup.exe** below.
2. Double-click it. If Windows shows a blue "Windows protected your PC" box,
   click **More info** → **Run anyway**.
3. Follow the installer. Your existing data is **not** touched by an update.

Built: ${built} · Version: ${ver}`
}

export function buildReleaseNotes(opts: {
  changelogText: string
  version: string
  isPrerelease: boolean
  commitSubjects: string[]
  builtDate?: string
}): string {
  const {
    changelogText,
    version: ver,
    isPrerelease: prerelease,
    commitSubjects,
    builtDate = new Date().toISOString().slice(0, 10),
  } = opts

  const parts: string[] = []

  if (prerelease) {
    parts.push('> **Development build — for testing only. Not for the client.**')
    parts.push('')
  }

  // Prefer the versioned section once notes have been filed after a stable ship.
  const versioned = readChangelogSection(changelogText, ver)
  // Unreleased is only consumed on stable so dig builds cannot re-advertise
  // leftover Phase notes after a release (FR-CI-05).
  const unreleased = prerelease ? '' : readChangelogUnreleased(changelogText)
  const changes = versioned || unreleased

  if (changes) {
    parts.push('## Changes')
    parts.push('')
    parts.push(changes)
    parts.push('')
  } else if (commitSubjects.length > 0) {
    parts.push('## Changes')
    parts.push('')
    for (const subject of commitSubjects) {
      parts.push(`- ${subject}`)
    }
    parts.push('')
  }

  parts.push(installFooter(ver, builtDate))
  return parts.join('\n').trimEnd() + '\n'
}
