import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDatabase, getDb, openDatabase } from '../src/main/db/client'
import { createAuditService } from '../src/main/services/audit.service'
import { createAuthService } from '../src/main/services/auth.service'
import { createPeriodService } from '../src/main/services/period.service'

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-period-reopen-'))
  openDatabase(path.join(dir, 'test.db'))
  migrate(getDb(), { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  const db = getDb()
  const audit = createAuditService(db)
  const auth = createAuthService(db, audit)
  const period = createPeriodService(db, audit)
  const owner = await auth.createUser({
    username: 'o',
    displayName: 'O',
    password: 'secret12',
    role: 'owner',
  })
  period.close('2026-06', owner.id)
  period.reopen('2026-06', owner.id, 'fix entry')
  console.log('isClosed after reopen', period.isClosed('2026-06'))
  try {
    period.close('2026-06', owner.id)
    console.log('SECOND CLOSE: OK')
  } catch (e) {
    console.log('SECOND CLOSE FAILED:', e instanceof Error ? e.message : e)
  }
  closeDatabase()
  fs.rmSync(dir, { recursive: true, force: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
