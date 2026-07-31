/**
 * Dev-only: delete the .tmp userData database and related files.
 */
import fs from 'node:fs'
import path from 'node:path'

if (process.env.NODE_ENV === 'production') {
  console.error('db:reset is disabled in production')
  process.exit(1)
}

const target = process.env.AQUA_NUQI_USER_DATA ?? path.join(process.cwd(), '.tmp', 'userData')
if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`Removed ${target}`)
} else {
  console.log(`Nothing to reset at ${target}`)
}
