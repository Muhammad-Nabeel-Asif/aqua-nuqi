import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildReleaseNotes,
  readChangelogSection,
  readChangelogUnreleased,
} from './release-notes-lib'

const sampleChangelog = `# Changelog

## [Unreleased]

### Added

- Stale leftover notes that should not pollute dig builds

## [0.2.6] — 2026-07-31

### Added

- Phase 0B shipped notes

## [0.1.0] — 2026-07-31

### Added

- Foundation
`

describe('release-notes (FR-CI-05)', () => {
  it('reads versioned and Unreleased sections independently', () => {
    expect(readChangelogSection(sampleChangelog, '0.2.6')).toContain('Phase 0B shipped notes')
    expect(readChangelogUnreleased(sampleChangelog)).toContain('Stale leftover notes')
    expect(readChangelogSection(sampleChangelog, '9.9.9')).toBe('')
  })

  it('treats heading-only Unreleased as empty', () => {
    const empty = `## [Unreleased]\n\n## [0.1.0]\n\n- done\n`
    expect(readChangelogUnreleased(empty)).toBe('')
  })

  it('stable prefers the matching version section over Unreleased', () => {
    const body = buildReleaseNotes({
      changelogText: sampleChangelog,
      version: '0.2.6',
      isPrerelease: false,
      commitSubjects: ['should not appear'],
      builtDate: '2026-07-31',
    })
    expect(body).toContain('Phase 0B shipped notes')
    expect(body).not.toContain('Stale leftover notes')
    expect(body).toContain('How to install (Windows)')
  })

  it('prerelease ignores Unreleased so leftover stable notes cannot pollute dig builds', () => {
    const body = buildReleaseNotes({
      changelogText: sampleChangelog,
      version: '0.2.7',
      isPrerelease: true,
      commitSubjects: ['Fix concurrency cancel of stable'],
      builtDate: '2026-07-31',
    })
    expect(body).toContain('Development build')
    expect(body).not.toContain('Stale leftover notes')
    expect(body).not.toContain('Phase 0B shipped notes')
    expect(body).toContain('Fix concurrency cancel of stable')
  })

  it('stable falls back to Unreleased when no version section exists', () => {
    const wip = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Phase 1 customers\n\n## [0.2.6]\n\n- old\n`
    const body = buildReleaseNotes({
      changelogText: wip,
      version: '0.3.1',
      isPrerelease: false,
      commitSubjects: [],
      builtDate: '2026-07-31',
    })
    expect(body).toContain('Phase 1 customers')
  })

  it('repo CHANGELOG has filed 0.2.6 notes; Unreleased must not re-advertise that stable', () => {
    const text = fs.readFileSync(path.join(process.cwd(), 'docs', 'CHANGELOG.md'), 'utf8')
    expect(readChangelogSection(text, '0.2.6')).toMatch(/Phase 0B/)
    // Unreleased may hold the next ship's notes; it must not still claim v0.2.6 is new.
    const unreleased = readChangelogUnreleased(text)
    expect(unreleased).not.toMatch(/First stable release:\s*\*\*v0\.2\.6\*\*/)
  })
})
