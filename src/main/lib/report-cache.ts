import { getDbWriteCounter } from './db-write-counter'

type CacheEntry = { writeCounter: number; value: unknown }

const cache = new Map<string, CacheEntry>()

/**
 * In-memory report cache keyed by (report name, params JSON, db write counter).
 * Switching tabs with the same params is instant; any audit mutation invalidates.
 */
export function cachedReport<T>(report: string, params: unknown, compute: () => T): T {
  const key = `${report}:${stableStringify(params)}`
  const current = getDbWriteCounter()
  const hit = cache.get(key)
  if (hit && hit.writeCounter === current) {
    return hit.value as T
  }
  const value = compute()
  cache.set(key, { writeCounter: current, value })
  return value
}

export function clearReportCache(): void {
  cache.clear()
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}
