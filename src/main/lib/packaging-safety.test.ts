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
    expect(yml).toMatch(/artifactName:\s*Aqua-Nuqi-Portable\.\$\{ext\}/)
    expect(yml).not.toMatch(/artifactName:.*\$\{version\}/)
  })

  it('includes a portable Windows target and uninstall data-delete guard', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/target:\s*portable/)
    expect(yml).toMatch(/include:\s*installer\.nsh/)
    const nsh = fs.readFileSync(path.join(root, 'resources', 'installer.nsh'), 'utf8')
    expect(nsh).toMatch(/!macro\s+customUnInstall/i)
    expect(nsh).toMatch(/\$\{IfNot\}\s+\$\{isUpdated\}/i)
    expect(nsh).toMatch(/MB_DEFBUTTON2/)
  })

  it('includes package.json in the packaged files (frozen name check on Windows)', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/^\s*-\s*package\.json\s*$/m)
  })

  it('ships branded icons and installer graphics at the sizes NSIS requires', () => {
    const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/icon:\s*resources\/icon\.ico/)
    expect(yml).toMatch(/icon:\s*resources\/icon\.png/)
    expect(yml).toMatch(/installerHeader:\s*resources\/brand\/installerHeader\.bmp/)
    expect(yml).toMatch(/installerSidebar:\s*resources\/brand\/installerSidebar\.bmp/)
    // resources/**/* must stay in `files`, or brand artwork is absent at runtime
    // and every PDF falls back to a bare initial.
    expect(yml).toMatch(/^\s*-\s*resources\/\*\*\/\*\s*$/m)

    // NSIS rejects anything but 24-bit BMP at these exact pixel sizes.
    const expectBmp = (file: string, width: number, height: number) => {
      const buf = fs.readFileSync(path.join(root, 'resources', 'brand', file))
      expect(buf.subarray(0, 2).toString('ascii'), `${file} is not a BMP`).toBe('BM')
      expect(buf.readInt32LE(18), `${file} width`).toBe(width)
      expect(buf.readInt32LE(22), `${file} height`).toBe(height)
      expect(buf.readUInt16LE(28), `${file} bit depth`).toBe(24)
    }
    expectBmp('installerHeader.bmp', 150, 57)
    expectBmp('installerSidebar.bmp', 164, 314)
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
