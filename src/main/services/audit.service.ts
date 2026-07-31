import type { AppDatabase } from '@main/db/client'
import { auditLog } from '@main/db/schema'
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
export type TxLike = Pick<AppDatabase, 'insert' | 'select' | 'update'>

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

  return { record, withAudit, listRecent }
}

export type AuditService = ReturnType<typeof createAuditService>
