import fs from 'node:fs'
import path from 'node:path'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import type { AppDatabase } from '@main/db/client'
import { auditLog, users } from '@main/db/schema'
import { bumpDbWriteCounter } from '@main/lib/db-write-counter'
import { createZipFromFiles } from '@main/lib/zip'
import type { AuditAction } from '@shared/constants'
import { nowIsoUtc } from '@shared/date'

export type AuditRecordInput = {
  userId?: number | null
  action: AuditAction
  entityTable?: string | null
  entityId?: number | null
  summary: string
  before?: unknown
  after?: unknown
}

/** Drizzle transaction or root db — anything that can insert/select/update. */
export type TxLike = Pick<AppDatabase, 'insert' | 'select' | 'update' | 'delete'>

const NON_MUTATING: ReadonlySet<AuditAction> = new Set(['login', 'logout'])

export type AuditDiffField = {
  field: string
  oldValue: string | null
  newValue: string | null
}

function stringifyValue(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Build a readable field-level before/after diff from JSON blobs. */
export function buildAuditDiff(
  beforeJson: string | null,
  afterJson: string | null,
): AuditDiffField[] {
  let before: Record<string, unknown> = {}
  let after: Record<string, unknown> = {}
  try {
    if (beforeJson) {
      const parsed = JSON.parse(beforeJson) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        before = parsed as Record<string, unknown>
      } else {
        before = { value: parsed }
      }
    }
  } catch {
    before = { value: beforeJson }
  }
  try {
    if (afterJson) {
      const parsed = JSON.parse(afterJson) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        after = parsed as Record<string, unknown>
      } else {
        after = { value: parsed }
      }
    }
  } catch {
    after = { value: afterJson }
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const diff: AuditDiffField[] = []
  for (const field of [...keys].sort()) {
    const oldValue = stringifyValue(before[field])
    const newValue = stringifyValue(after[field])
    if (oldValue === newValue) continue
    diff.push({ field, oldValue, newValue })
  }
  return diff
}

export type AuditListFilter = {
  from?: string
  to?: string
  userId?: number
  action?: AuditAction
  entityTable?: string
  search?: string
  limit?: number
  offset?: number
}

export function createAuditService(db: AppDatabase) {
  function record(input: AuditRecordInput, tx: TxLike = db): void {
    tx.insert(auditLog)
      .values({
        occurredAt: nowIsoUtc(),
        userId: input.userId ?? null,
        action: input.action,
        entityTable: input.entityTable ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary,
        beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
        afterJson: input.after === undefined ? null : JSON.stringify(input.after),
      })
      .run()
    if (!NON_MUTATING.has(input.action)) {
      bumpDbWriteCounter()
    }
  }

  function withAudit<T>(tx: TxLike, input: AuditRecordInput, work: () => T): T {
    const result = work()
    record(input, tx)
    return result
  }

  function listRecent(limit = 20) {
    const rows = db.select().from(auditLog).all()
    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      action: r.action,
      summary: r.summary,
    }))
  }

  function list(filter: AuditListFilter = {}) {
    const all = db.select().from(auditLog).all()
    const userRows = db.select().from(users).all()
    const userMap = new Map(userRows.map((u) => [u.id, u.username]))

    let filtered = all
    if (filter.from) {
      filtered = filtered.filter((r) => r.occurredAt >= filter.from!)
    }
    if (filter.to) {
      // inclusive end-of-day if date-only
      const to = filter.to.length === 10 ? `${filter.to}T23:59:59.999Z` : filter.to
      filtered = filtered.filter((r) => r.occurredAt <= to)
    }
    if (filter.userId !== undefined) {
      filtered = filtered.filter((r) => r.userId === filter.userId)
    }
    if (filter.action) {
      filtered = filtered.filter((r) => r.action === filter.action)
    }
    if (filter.entityTable) {
      filtered = filtered.filter((r) => r.entityTable === filter.entityTable)
    }
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase()
      filtered = filtered.filter((r) => r.summary.toLowerCase().includes(q))
    }

    filtered.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    const total = filtered.length
    const offset = filter.offset ?? 0
    const limit = filter.limit ?? 200
    const page = filtered.slice(offset, offset + limit)

    return {
      total,
      items: page.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        userId: r.userId,
        username: r.userId != null ? (userMap.get(r.userId) ?? null) : null,
        action: r.action as AuditAction,
        entityTable: r.entityTable,
        entityId: r.entityId,
        summary: r.summary,
        beforeJson: r.beforeJson,
        afterJson: r.afterJson,
        diff: buildAuditDiff(r.beforeJson, r.afterJson),
      })),
    }
  }

  function exportExcel(filter: AuditListFilter, destinationFolder: string): string {
    const { items } = list({ ...filter, limit: 5000, offset: 0 })
    const rows = items.map((i) => ({
      When: i.occurredAt,
      User: i.username ?? '',
      Action: i.action,
      Entity: i.entityTable ?? '',
      EntityId: i.entityId ?? '',
      Summary: i.summary,
      Changes: i.diff
        .map((d) => `${d.field}: ${d.oldValue ?? '∅'} → ${d.newValue ?? '∅'}`)
        .join('; '),
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Audit')
    fs.mkdirSync(destinationFolder, { recursive: true })
    const filePath = path.join(
      destinationFolder,
      `aqua-nuqi-audit-${nowIsoUtc().replace(/[:.]/g, '-')}.xlsx`,
    )
    XLSX.writeFile(book, filePath)
    return filePath
  }

  function archiveOlderThan(
    years: number,
    destinationFolder: string,
  ): { archivedCount: number; archivePath: string } {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - years)
    const cutoffIso = cutoff.toISOString()
    const old = db
      .select()
      .from(auditLog)
      .all()
      .filter((r) => r.occurredAt < cutoffIso)

    fs.mkdirSync(destinationFolder, { recursive: true })
    const archivePath = path.join(
      destinationFolder,
      `aqua-nuqi-audit-archive-${nowIsoUtc().replace(/[:.]/g, '-')}.zip`,
    )
    createZipFromFiles(
      [
        {
          name: 'audit-archive.json',
          content: JSON.stringify(old, null, 2),
        },
      ],
      archivePath,
    )

    db.transaction((tx) => {
      for (const row of old) {
        tx.delete(auditLog).where(eq(auditLog.id, row.id)).run()
      }
    })

    return { archivedCount: old.length, archivePath }
  }

  // silence unused import warnings for drizzle helpers kept for future SQL path
  void and
  void gte
  void lte
  void sql

  return {
    record,
    withAudit,
    listRecent,
    list,
    exportExcel,
    archiveOlderThan,
    buildAuditDiff,
  }
}

export type AuditService = ReturnType<typeof createAuditService>
