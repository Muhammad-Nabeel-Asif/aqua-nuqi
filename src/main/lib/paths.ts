import fs from 'node:fs'
import path from 'node:path'
import {
  APP_ID,
  BACKUPS_RELATIVE_DIR,
  DB_FILE_NAME,
  DB_RELATIVE_DIR,
  LOGS_RELATIVE_DIR,
  PACKAGE_NAME,
  PRODUCT_NAME,
} from '@shared/constants'
import { AppError } from '@shared/errors'

/**
 * Resolve package.json in both layouts:
 * - packaged/bundled main: `…/resources/app/out/main` → `../../package.json`
 * - source / vitest: `src/main/lib` → `../../../package.json`
 * - optional Electron `app.getAppPath()` / cwd fallbacks
 */
export function resolvePackageJsonPath(
  fromDir: string = __dirname,
  extraRoots: string[] = [],
): string | null {
  const candidates = [
    ...extraRoots.map((root) => path.join(root, 'package.json')),
    path.join(fromDir, '../../package.json'),
    path.join(fromDir, '../../../package.json'),
    path.join(process.cwd(), 'package.json'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate)
  }
  return null
}

function readPackageName(extraRoots: string[] = []): string {
  const pkgPath = resolvePackageJsonPath(__dirname, extraRoots)
  if (!pkgPath) return ''
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string }
    return pkg.name ?? ''
  } catch {
    return ''
  }
}

export type AppPaths = {
  userData: string
  dbDir: string
  dbPath: string
  backupsDir: string
  logsDir: string
  configPath: string
  installDir: string
  resourcesPath: string
}

export type PathConfig = {
  dbPath?: string
  backupsDir?: string
}

export function assertFrozenIdentity(extraRoots: string[] = []): void {
  const name = readPackageName(extraRoots)
  if (name !== PACKAGE_NAME) {
    throw new AppError(
      'FATAL_PATH',
      `package.json name must be "${PACKAGE_NAME}" (frozen). Found "${name}".`,
    )
  }
}

/**
 * Assert runtime identity against frozen constants.
 * Pass Electron's `app.getName()` (and AppUserModelId on Windows) — never the constants
 * themselves, or the check is tautological.
 * `appPath` should be Electron's `app.getAppPath()` so packaged installs resolve package.json.
 */
export function assertAppIdentity(
  runtimeAppName: string,
  runtimeAppId?: string,
  appPath?: string,
): void {
  assertFrozenIdentity(appPath ? [appPath] : [])
  if (runtimeAppName !== PRODUCT_NAME) {
    throw new AppError(
      'FATAL_PATH',
      `app name must be "${PRODUCT_NAME}" (frozen). Found "${runtimeAppName}".`,
    )
  }
  if (runtimeAppId !== undefined && runtimeAppId !== APP_ID) {
    throw new AppError('FATAL_PATH', `appId must be "${APP_ID}" (frozen). Found "${runtimeAppId}".`)
  }
}

/** userData folder basename must stay PRODUCT_NAME on every platform. */
export function assertUserDataPath(userData: string): void {
  const base = path.basename(path.resolve(userData))
  if (base !== PRODUCT_NAME) {
    throw new AppError(
      'FATAL_PATH',
      `userData folder must be "${PRODUCT_NAME}" (frozen). Found "${base}".`,
    )
  }
}

/** Resolve the canonical userData directory (forces PRODUCT_NAME on Linux too). */
export function resolveCanonicalUserData(appData: string): string {
  return path.join(appData, PRODUCT_NAME)
}

export function readElectronBuilderIdentity(ymlText: string): {
  appId: string | null
  productName: string | null
} {
  const appId = /^appId:\s*(.+)$/m.exec(ymlText)?.[1]?.trim() ?? null
  const productName = /^productName:\s*(.+)$/m.exec(ymlText)?.[1]?.trim() ?? null
  return { appId, productName }
}

export function assertElectronBuilderIdentity(ymlText: string): void {
  const { appId, productName } = readElectronBuilderIdentity(ymlText)
  if (appId !== APP_ID) {
    throw new AppError(
      'FATAL_PATH',
      `electron-builder.yml appId must be "${APP_ID}" (frozen). Found "${appId}".`,
    )
  }
  if (productName !== PRODUCT_NAME) {
    throw new AppError(
      'FATAL_PATH',
      `electron-builder.yml productName must be "${PRODUCT_NAME}" (frozen). Found "${productName}".`,
    )
  }
}

export function resolveAppPaths(
  userData: string,
  installDir: string,
  resourcesPath: string,
  config?: PathConfig,
): AppPaths {
  const dbDir = path.join(userData, DB_RELATIVE_DIR)
  const dbPath = config?.dbPath ?? path.join(dbDir, DB_FILE_NAME)
  const backupsDir = config?.backupsDir ?? path.join(userData, BACKUPS_RELATIVE_DIR)
  const logsDir = path.join(userData, LOGS_RELATIVE_DIR)
  const configPath = path.join(userData, 'aqua-nuqi.config.json')

  assertDbPathSafe(dbPath, userData, installDir, resourcesPath)

  return {
    userData,
    dbDir,
    dbPath,
    backupsDir,
    logsDir,
    configPath,
    installDir,
    resourcesPath,
  }
}

export function assertDbPathSafe(
  dbPath: string,
  userData: string,
  installDir: string,
  resourcesPath: string,
): void {
  const resolvedDb = path.resolve(dbPath)
  const resolvedUserData = path.resolve(userData)
  const resolvedInstall = path.resolve(installDir)
  const resolvedResources = path.resolve(resourcesPath)

  const under = (child: string, parent: string) =>
    child === parent || child.startsWith(parent + path.sep)

  if (!under(resolvedDb, resolvedUserData)) {
    throw new AppError(
      'FATAL_PATH',
      `Database path must resolve under userData (${resolvedUserData}). Got: ${resolvedDb}`,
    )
  }

  if (under(resolvedDb, resolvedInstall) || under(resolvedDb, resolvedResources)) {
    throw new AppError(
      'FATAL_PATH',
      `Database path must not be inside the install directory. Got: ${resolvedDb}`,
    )
  }
}

export function readPathConfig(configPath: string): PathConfig {
  try {
    if (!fs.existsSync(configPath)) return {}
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PathConfig
    return {
      dbPath: typeof raw.dbPath === 'string' ? raw.dbPath : undefined,
      backupsDir: typeof raw.backupsDir === 'string' ? raw.backupsDir : undefined,
    }
  } catch {
    return {}
  }
}

export function writePathConfig(configPath: string, config: PathConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

export function ensureDirs(paths: AppPaths): void {
  fs.mkdirSync(paths.dbDir, { recursive: true })
  fs.mkdirSync(paths.backupsDir, { recursive: true })
  fs.mkdirSync(paths.logsDir, { recursive: true })
}
