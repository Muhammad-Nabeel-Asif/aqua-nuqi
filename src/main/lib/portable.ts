import path from 'node:path'
import { PRODUCT_NAME } from '@shared/constants'

/** Clearly labelled data folder beside the portable executable. */
export const PORTABLE_DATA_FOLDER = 'Aqua Nuqi Portable Data' as const

export function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}

export function resolvePortableUserData(): string | null {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  if (!dir) return null
  return path.join(dir, PORTABLE_DATA_FOLDER)
}

/** Basename allowed for userData (installed vs portable). */
export function isAllowedUserDataBasename(base: string): boolean {
  return base === PRODUCT_NAME || base === PORTABLE_DATA_FOLDER
}
