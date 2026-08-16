import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type ParsedHandler = { channel: string; roles: string }

function parseHandlerFile(source: string): ParsedHandler[] {
  const results: ParsedHandler[] = []
  const chunks = source.split('defineHandler(')
  for (const chunk of chunks.slice(1)) {
    const channel = /channel:\s*'([^']+)'/.exec(chunk)?.[1]
    const roles = /roles:\s*('public'|'authenticated'|\[[^\]]+\])/.exec(chunk)?.[1]
    if (channel && roles) results.push({ channel, roles })
  }
  return results
}

function loadAllHandlers(): Map<string, string> {
  const dir = path.join(process.cwd(), 'src/main/ipc/handlers')
  const map = new Map<string, string>()
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    const parsed = parseHandlerFile(fs.readFileSync(path.join(dir, name), 'utf8'))
    for (const h of parsed) {
      if (map.has(h.channel)) {
        throw new Error(`Duplicate channel ${h.channel} in ${name}`)
      }
      map.set(h.channel, h.roles)
    }
  }
  return map
}

describe('IPC handler role contract', () => {
  const roles = loadAllHandlers()

  it('setup:complete and setup:restore stay public', () => {
    expect(roles.get('setup:complete')).toBe("'public'")
    expect(roles.get('setup:restore')).toBe("'public'")
  })

  it("owner-only mutating channels keep roles: ['owner']", () => {
    expect(roles.get('period:close')).toBe("['owner']")
    expect(roles.get('period:reopen')).toBe("['owner']")
    expect(roles.get('backup:restore')).toBe("['owner']")
    expect(roles.get('expenses:create')).toBe("['owner']")
    expect(roles.get('payroll:finalize')).toBe("['owner']")
    expect(roles.get('dev:seedDemo')).toBe("['owner']")
  })

  it('settings:setMany is authenticated (owner-only keys filtered in the handler)', () => {
    expect(roles.get('settings:setMany')).toBe("'authenticated'")
  })

  it('deliveries:upsert is owner and operator', () => {
    expect(roles.get('deliveries:upsert')).toBe("['owner', 'operator']")
  })

  it('every defineHandler has a channel and roles', () => {
    expect(roles.size).toBeGreaterThan(50)
    expect(roles.has('auth:login')).toBe(true)
    expect(roles.get('auth:login')).toBe("'public'")
  })
})
