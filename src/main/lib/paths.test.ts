import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ID, PACKAGE_NAME, PRODUCT_NAME } from '@shared/constants'
import { AppError } from '@shared/errors'
import {
  assertAppIdentity,
  assertDbPathSafe,
  assertElectronBuilderIdentity,
  assertFrozenIdentity,
  assertUserDataPath,
  resolveAppPaths,
  resolveCanonicalUserData,
  resolveDevUserData,
  resolvePackageJsonPath,
} from './paths'

describe('frozen identity', () => {
  it('matches package.json name and frozen constants', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      name: string
    }
    expect(pkg.name).toBe(PACKAGE_NAME)
    expect(APP_ID).toBe('com.aquanuqi.app')
    expect(PRODUCT_NAME).toBe('Aqua Nuqi')
    expect(() => assertFrozenIdentity()).not.toThrow()
  })

  it('matches electron-builder.yml appId and productName', () => {
    const yml = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf8')
    expect(() => assertElectronBuilderIdentity(yml)).not.toThrow()
    expect(yml).toMatch(new RegExp(`^appId:\\s*${APP_ID}$`, 'm'))
    expect(yml).toMatch(new RegExp(`^productName:\\s*${PRODUCT_NAME}$`, 'm'))
  })

  it('rejects a wrong runtime app name (not a tautological constant check)', () => {
    expect(() => assertAppIdentity('Wrong Name', APP_ID)).toThrow(AppError)
    expect(() => assertAppIdentity(PRODUCT_NAME, 'com.other.app')).toThrow(AppError)
    expect(() => assertAppIdentity(PRODUCT_NAME, APP_ID)).not.toThrow()
  })

  it('resolves package.json from the packaged out/main layout (Windows/NSIS)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-pkg-layout-'))
    try {
      const appRoot = path.join(tmp, 'resources', 'app')
      const mainDir = path.join(appRoot, 'out', 'main')
      fs.mkdirSync(mainDir, { recursive: true })
      fs.writeFileSync(
        path.join(appRoot, 'package.json'),
        JSON.stringify({ name: PACKAGE_NAME, version: '0.2.6' }),
        'utf8',
      )

      // Packaged layout: out/main → ../../package.json (NOT ../../../ which lands in resources/)
      const found = resolvePackageJsonPath(mainDir)
      expect(found).toBe(path.resolve(appRoot, 'package.json'))
      expect(JSON.parse(fs.readFileSync(found!, 'utf8')).name).toBe(PACKAGE_NAME)

      // Also accepts Electron app.getAppPath() as an explicit root
      const viaAppPath = resolvePackageJsonPath(path.join(tmp, 'missing'), [appRoot])
      expect(viaAppPath).toBe(path.resolve(appRoot, 'package.json'))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('forces userData basename to PRODUCT_NAME on every platform', () => {
    const canonical = resolveCanonicalUserData('/tmp/appData')
    expect(path.basename(canonical)).toBe(PRODUCT_NAME)
    expect(() => assertUserDataPath(canonical)).not.toThrow()
    expect(() => assertUserDataPath('/tmp/appData/aqua-nuqi')).toThrow(AppError)
  })

  it('resolves unpackaged dev userData under .tmp with PRODUCT_NAME basename', () => {
    const dev = resolveDevUserData('/repo/Aqua Nuqi')
    expect(dev).toBe(path.join('/repo/Aqua Nuqi', '.tmp', PRODUCT_NAME))
    expect(() => assertUserDataPath(dev)).not.toThrow()
  })

  it('allows the portable data folder basename', () => {
    expect(() => assertUserDataPath('/tmp/stick/Aqua Nuqi Portable Data')).not.toThrow()
  })

  it('rejects install-dir and resources basenames while allowing Aqua Nuqi', () => {
    expect(() => assertUserDataPath('/opt/Aqua Nuqi/resources')).toThrow(AppError)
    expect(() => assertUserDataPath('/opt/Aqua Nuqi/install')).toThrow(AppError)
    expect(() => assertUserDataPath('/home/user/.config/Aqua Nuqi')).not.toThrow()
  })
})

describe('db path safety', () => {
  it('accepts a path under userData', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-paths-'))
    const userData = path.join(tmp, PRODUCT_NAME)
    const installDir = path.join(tmp, 'install')
    const resourcesPath = path.join(installDir, 'resources')
    try {
      const paths = resolveAppPaths(userData, installDir, resourcesPath)
      expect(paths.dbPath.startsWith(userData)).toBe(true)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects a database path inside the install directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-paths-'))
    const userData = path.join(tmp, PRODUCT_NAME)
    const installDir = path.join(tmp, 'install')
    const resourcesPath = path.join(installDir, 'resources')
    try {
      expect(() =>
        assertDbPathSafe(
          path.join(installDir, 'aqua-nuqi.db'),
          userData,
          installDir,
          resourcesPath,
        ),
      ).toThrow(AppError)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects a database path outside userData', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-paths-'))
    const userData = path.join(tmp, PRODUCT_NAME)
    const installDir = path.join(tmp, 'install')
    const resourcesPath = path.join(installDir, 'resources')
    try {
      expect(() =>
        assertDbPathSafe(path.join(tmp, 'elsewhere.db'), userData, installDir, resourcesPath),
      ).toThrow(AppError)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('main process boot order', () => {
  it('sets userData before requesting the single-instance lock', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const setPath = src.indexOf("app.setPath('userData'")
    const lock = src.indexOf('requestSingleInstanceLock')
    expect(setPath).toBeGreaterThan(-1)
    expect(lock).toBeGreaterThan(setPath)
  })
})
