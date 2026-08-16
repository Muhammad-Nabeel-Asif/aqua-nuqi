import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { closedPeriods } from '@main/db/schema'
import { assertBusinessDate, assertPeriod, nowIsoUtc, periodFromDate } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'

export function createPeriodService(db: AppDatabase, audit: AuditService) {
  function isClosed(period: string): boolean {
    assertPeriod(period)
    const row = db
      .select()
      .from(closedPeriods)
      .where(and(eq(closedPeriods.period, period), isNull(closedPeriods.reopenedAt)))
      .get()
    return Boolean(row)
  }

  function guardPeriodOpen(dateOrPeriod: string): void {
    const period = dateOrPeriod.length === 7 ? dateOrPeriod : periodFromDate(dateOrPeriod)
    if (dateOrPeriod.length === 10) assertBusinessDate(dateOrPeriod)
    else assertPeriod(dateOrPeriod)
    if (isClosed(period)) {
      throw new AppError(
        'PERIOD_LOCKED',
        `This billing month (${period}) is locked and cannot be changed. Unlock it under Billing → Billing months if you need to edit.`,
      )
    }
  }

  function close(period: string, userId: number, notes?: string): void {
    assertPeriod(period)
    if (isClosed(period)) {
      throw new AppError('CONFLICT', `Period ${period} is already closed.`)
    }
    const now = nowIsoUtc()
    db.transaction((tx) => {
      // Reuse the UNIQUE period row after a reopen (clear reopened_*).
      const existing = tx.select().from(closedPeriods).where(eq(closedPeriods.period, period)).get()
      if (existing) {
        tx.update(closedPeriods)
          .set({
            closedAt: now,
            closedBy: userId,
            reopenedAt: null,
            reopenedBy: null,
            notes: notes ?? null,
          })
          .where(eq(closedPeriods.id, existing.id))
          .run()
      } else {
        tx.insert(closedPeriods)
          .values({
            period,
            closedAt: now,
            closedBy: userId,
            notes: notes ?? null,
          })
          .run()
      }
      audit.record(
        {
          userId,
          action: 'period_close',
          entityTable: 'closed_periods',
          summary: `Closed period ${period}`,
          after: { period, notes },
        },
        tx,
      )
    })
  }

  function reopen(period: string, userId: number, reason: string): void {
    assertPeriod(period)
    const row = db
      .select()
      .from(closedPeriods)
      .where(and(eq(closedPeriods.period, period), isNull(closedPeriods.reopenedAt)))
      .get()
    if (!row) {
      throw new AppError('NOT_FOUND', `Period ${period} is not currently closed.`)
    }
    db.transaction((tx) => {
      tx.update(closedPeriods)
        .set({
          reopenedAt: nowIsoUtc(),
          reopenedBy: userId,
          notes: reason,
        })
        .where(eq(closedPeriods.id, row.id))
        .run()
      audit.record(
        {
          userId,
          action: 'period_reopen',
          entityTable: 'closed_periods',
          entityId: row.id,
          summary: `Reopened period ${period}: ${reason}`,
          before: { period },
          after: { period, reason },
        },
        tx,
      )
    })
  }

  function list() {
    const rows = db.select().from(closedPeriods).all()
    rows.sort((a, b) => (a.period < b.period ? 1 : -1))
    return rows.map((r) => ({
      period: r.period,
      closedAt: r.closedAt,
      reopenedAt: r.reopenedAt,
      notes: r.notes,
    }))
  }

  return { isClosed, guardPeriodOpen, close, reopen, list }
}

export type PeriodService = ReturnType<typeof createPeriodService>
