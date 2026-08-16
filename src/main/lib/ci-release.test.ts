import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readWorkflow(): string {
  return fs.readFileSync(path.join(root, '.github', 'workflows', 'build-release.yml'), 'utf8')
}

function readCheckWorkflow(): string {
  return fs.readFileSync(path.join(root, '.github', 'workflows', 'build-check.yml'), 'utf8')
}

function readReadme(): string {
  return fs.readFileSync(path.join(root, 'README.md'), 'utf8')
}

function readProgress(): string {
  return fs.readFileSync(path.join(root, 'docs', 'phases', 'PROGRESS.md'), 'utf8')
}

describe('CI release safety (Phase 0B review)', () => {
  it('keeps push and stable in separate concurrency groups; does not cancel stable', () => {
    const yml = readWorkflow()
    // Must include event_name / channel so workflow_dispatch stable ≠ push
    expect(yml).toMatch(
      /group:\s*build-release-\$\{\{\s*github\.ref\s*\}\}-\$\{\{\s*github\.event_name/,
    )
    expect(yml).toMatch(/github\.event\.inputs\.channel/)
    // Unconditional cancel-in-progress: true would let a docs push kill a stable run
    expect(yml).not.toMatch(/cancel-in-progress:\s*true\s*\n\nenv:/)
    expect(yml).toMatch(
      /cancel-in-progress:\s*\$\{\{\s*github\.event\.inputs\.channel\s*!=\s*'stable'\s*\}\}/,
    )
  })

  it('publishes as draft on Windows and only undrafts after Linux assets attach', () => {
    const yml = readWorkflow()
    const windowsPublish = yml.slice(
      yml.indexOf('Create draft release'),
      yml.indexOf('build-linux:'),
    )
    const linuxPublish = yml.slice(yml.indexOf('Attach Ubuntu builds'))

    expect(windowsPublish).toMatch(/draft:\s*true/)
    expect(windowsPublish).toMatch(/make_latest:\s*false/)
    // Linux must update the Windows draft via `gh release upload/edit`, not
    // softprops draft:false (creates a second release → tag already_exists).
    expect(linuxPublish).not.toMatch(/uses:\s*softprops\/action-gh-release/)
    expect(linuxPublish).toMatch(/gh release upload/)
    expect(linuxPublish).toMatch(/gh release edit/)
    expect(linuxPublish).toMatch(/--draft=false/)
  })

  it('quality gate runs production build (FR-CI-03)', () => {
    const release = readWorkflow()
    const qualityBlock = release.slice(
      release.indexOf('quality:'),
      release.indexOf('build-windows:'),
    )
    expect(qualityBlock).toMatch(/npm run typecheck/)
    expect(qualityBlock).toMatch(/npm run lint/)
    expect(qualityBlock).toMatch(/npm run test/)
    expect(qualityBlock).toMatch(/npm run build/)
    expect(qualityBlock).toMatch(/npm run test:e2e/)

    const check = readCheckWorkflow()
    expect(check).toMatch(/npm run build/)
    expect(check).toMatch(/npm run test:e2e/)
    expect(check).toMatch(/xvfb-run/)
  })

  it('Linux job smokes the AppImage with isolated userData', () => {
    const yml = readWorkflow()
    const linux = yml.slice(yml.indexOf('build-linux:'))
    expect(linux).toMatch(/npm run test:smoke:linux/)
    expect(linux).toMatch(/xvfb-run/)
  })

  it('Windows job smokes the portable exe with isolated userData; PR CI does not', () => {
    const yml = readWorkflow()
    const windows = yml.slice(yml.indexOf('build-windows:'), yml.indexOf('build-linux:'))
    expect(windows).toMatch(/npm run dist:win/)
    expect(windows).toMatch(/npm run test:smoke:win/)

    const check = readCheckWorkflow()
    expect(check).not.toMatch(/test:smoke:win/)
    expect(check).not.toMatch(/test:smoke:linux/)
  })

  it('Linux artifact upload hard-fails if .deb is missing', () => {
    const yml = readWorkflow()
    const linuxArtifact = yml.slice(
      yml.indexOf('name: Aqua-Nuqi-Linux'),
      yml.indexOf('Attach Ubuntu builds'),
    )
    expect(linuxArtifact).toMatch(/release\/\*\.AppImage/)
    expect(linuxArtifact).toMatch(/release\/\*\.deb/)
    expect(linuxArtifact).toMatch(/if-no-files-found:\s*error/)
  })

  it('README release badge tracks stable only (no include_prereleases)', () => {
    const readme = readReadme()
    expect(readme).toMatch(/img\.shields\.io\/github\/v\/release\/Muhammad-Nabeel-Asif\/aqua-nuqi/)
    expect(readme).not.toMatch(/include_prereleases/)
  })

  it('PROGRESS marks Phase 0B complete after Windows matrix (v0.2.11)', () => {
    const progress = readProgress()
    const phase0b = progress.slice(progress.indexOf('## Phase 0B'))
    expect(phase0b).toMatch(/\*\*Status:\*\*\s*complete/)
    expect(phase0b).toMatch(/Windows upgrade matrix/)
    expect(phase0b).toMatch(/v0\.2\.11/)
  })
})
