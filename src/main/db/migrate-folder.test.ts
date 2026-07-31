import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveMigrationsFolder } from './migrate'

describe('resolveMigrationsFolder', () => {
  it('prefers resourcesPath/drizzle over process.cwd() (packaged restore path)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-mig-'))
    try {
      const resources = path.join(tmp, 'resources')
      const appRoot = path.join(tmp, 'app')
      const cwdDrizzle = path.join(tmp, 'cwd-drizzle')
      fs.mkdirSync(path.join(resources, 'drizzle'), { recursive: true })
      fs.mkdirSync(cwdDrizzle, { recursive: true })
      const prev = process.cwd()
      process.chdir(tmp)
      try {
        // Even if cwd has something else, resourcesPath wins when present.
        const resolved = resolveMigrationsFolder(appRoot, resources)
        expect(resolved).toBe(path.join(resources, 'drizzle'))
      } finally {
        process.chdir(prev)
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
