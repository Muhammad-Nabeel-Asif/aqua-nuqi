import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ID, PACKAGE_NAME, PRODUCT_NAME } from '@shared/constants'

const root = process.cwd()

describe('packaging data-safety (FR-CI-07)', () => {
  it('keeps frozen identity in package.json and electron-builder.yml', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      name: string
    }
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(pkg.name).toBe(PACKAGE_NAME)
    expect(yml).toMatch(new RegExp(`^appId:\\s*${APP_ID}$`, 'm'))
    expect(yml).toMatch(new RegExp(`^productName:\\s*${PRODUCT_NAME}$`, 'm'))
  })

  it('uses fixed version-free artifact names for permanent download links', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/artifactName:\s*Aqua-Nuqi-Setup\.\$\{ext\}/)
    expect(yml).toMatch(/artifactName:\s*Aqua-Nuqi\.\$\{ext\}/)
    expect(yml).not.toMatch(/artifactName:.*\$\{version\}/)
  })

  it('includes package.json in the packaged files (frozen name check on Windows)', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/^\s*-\s*package\.json\s*$/m)
  })

  it('keeps deleteAppDataOnUninstall false (assisted installer; do not rely on it alone)', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/deleteAppDataOnUninstall:\s*false/)
    expect(yml).toMatch(/oneClick:\s*false/)
    expect(yml).toMatch(/perMachine:\s*false/)
  })

  it('has no customUnInstall NSIS macro, or wraps destructive lines in isUpdated', () => {
    const nshCandidates = [
      path.join(root, 'build', 'installer.nsh'),
      path.join(root, 'resources', 'installer.nsh'),
      path.join(root, 'installer.nsh'),
    ]
    const existing = nshCandidates.filter((p) => fs.existsSync(p))
    if (existing.length === 0) {
      expect(existing).toEqual([])
      return
    }

    for (const file of existing) {
      const text = fs.readFileSync(file, 'utf8')
      if (!/!macro\s+customUnInstall/i.test(text)) continue

      const macroMatch = text.match(/!macro\s+customUnInstall([\s\S]*?)!macroend/i)
      expect(macroMatch).toBeTruthy()
      const body = macroMatch![1]
      const destructive = /RMDir|Delete\s+|rmdir|FileDelete|SetShellVarContext/i.test(body)
      if (destructive) {
        expect(body).toMatch(/\$\{IfNot\}\s+\$\{isUpdated\}/i)
      }
    }
  })

  it('gitignore excludes databases, release output, attachments and backups', () => {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    for (const pattern of [
      'node_modules/',
      'out/',
      'dist/',
      'release/',
      '*.db',
      '*.sqlite',
      'data/',
      '.env',
      'attachments/',
      'backups/',
    ]) {
      expect(gi).toContain(pattern)
    }
  })
})
