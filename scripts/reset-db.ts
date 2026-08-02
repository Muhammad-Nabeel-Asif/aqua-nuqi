/**
 * Dev-only: delete the unpackaged userData folder used by `npm run dev`.
 * Does not touch packaged AppImage / Setup data under ~/.config or %AppData%.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PRODUCT_NAME } from '@shared/constants'

if (process.env.NODE_ENV === 'production') {
  console.error('db:reset is disabled in production')
  process.exit(1)
}

const target =
  process.env.AQUA_NUQI_USER_DATA?.trim() || path.join(process.cwd(), '.tmp', PRODUCT_NAME)

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`Removed ${target}`)
  console.log('(Dev profile only — packaged AppImage/Setup data was not touched.)')
} else {
  console.log(`Nothing to reset at ${target}`)
  console.log('Tip: quit `npm run dev` first, then run db:reset again.')
}
