/**
 * CLI entry for `npm run db:migrate`.
 * Uses a temp userData-like folder under .tmp for non-Electron migration runs,
 * or AQUA_NUQI_DB_PATH / AQUA_NUQI_USER_DATA if provided.
 */
import fs from 'node:fs'
import path from 'node:path'
import { closeDatabase } from '../src/main/db/client'
import { runBootMigrations } from '../src/main/db/migrate'
import { ensureDirs, resolveAppPaths } from '../src/main/lib/paths'

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string
}

const userData = process.env.AQUA_NUQI_USER_DATA ?? path.join(process.cwd(), '.tmp', 'userData')
const installDir = path.join(process.cwd(), '.tmp', 'install-fake')
const resourcesPath = path.join(installDir, 'resources')

fs.mkdirSync(userData, { recursive: true })
fs.mkdirSync(resourcesPath, { recursive: true })

const paths = resolveAppPaths(
  userData,
  installDir,
  resourcesPath,
  process.env.AQUA_NUQI_DB_PATH ? { dbPath: process.env.AQUA_NUQI_DB_PATH } : undefined,
)
ensureDirs(paths)

const migrationsFolder = path.join(process.cwd(), 'drizzle')
const outcome = runBootMigrations({
  paths,
  migrationsFolder,
  appVersion: pkg.version,
})

console.log('Migration outcome:', outcome)
closeDatabase()
