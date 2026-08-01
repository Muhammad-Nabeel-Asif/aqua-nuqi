import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { ledgerEntries } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import { assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { Paisa } from '@shared/money'
import type { BalanceService } from './balance.service'

export type LedgerEntryType =
  | 'opening_balance'
  | 'invoice'
  | 'payment'
  | 'adjustment_debit'
  | 'adjustment_credit'
  | 'deposit_received'
  | 'deposit_refunded'
  | 'write_off'
  | 'void_reversal'

/** Entry types that are liabilities / not revenue (FR-BL-14). */
export const NON_REVENUE_ENTRY_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  'deposit_received',
  'deposit_refunded',
])

export type AppendEntryInput = {
  customerId: number
  date: string
  type: LedgerEntryType
  debit: number
  credit: number
  description: string
  refTable?: string | null
  refId?: number | null
  createdBy?: number | null
}

export type LedgerRow = {
  id: number
  uuid: string
  customerId: number
  entryDate: string
  entryType: LedgerEntryType
  debit: number
  credit: number
  balanceAfter: number
  description: string
  refTable: string | null
  refId: number | null
  createdAt: string
  createdBy: number | null
  isNonRevenue: boolean
}

type DbLike = AppDatabase

/**
 * Append-only customer ledger. Corrections are new entries — never updates or deletes.
 * balance_after is maintained; back-dated inserts recompute later rows in the same transaction.
 */
export function createLedgerService(db: AppDatabase, balanceService: BalanceService) {
  function sortKey(date: string, id: number): string {
    return `${date}\t${String(id).padStart(12, '0')}`
  }

  function naiveAggregate(customerId: number, tx: DbLike = db, asOf?: string): number {
    const rows = tx
      .select({
        debit: ledgerEntries.debit,
        credit: ledgerEntries.credit,
        entryDate: ledgerEntries.entryDate,
      })
      .from(ledgerEntries)
      .where(
        asOf
          ? and(eq(ledgerEntries.customerId, customerId), lte(ledgerEntries.entryDate, asOf))
          : eq(ledgerEntries.customerId, customerId),
      )
      .all()
    return rows.reduce((sum, r) => sum + r.debit - r.credit, 0)
  }

  function recomputeFrom(
    customerId: number,
    fromDate: string,
    fromId: number,
    startingBalance: number,
    tx: DbLike,
  ): number {
    const later = tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, customerId))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id))
      .all()
      .filter((r) => sortKey(r.entryDate, r.id) >= sortKey(fromDate, fromId))

    let running = startingBalance
    for (const row of later) {
      running = running + row.debit - row.credit
      if (row.balanceAfter !== running) {
        tx.update(ledgerEntries)
          .set({ balanceAfter: running })
          .where(eq(ledgerEntries.id, row.id))
          .run()
      }
    }
    return running
  }

  function balanceBefore(customerId: number, date: string, beforeId: number, tx: DbLike): number {
    const prior = tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, customerId))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id))
      .all()
      .filter((r) => sortKey(r.entryDate, r.id) < sortKey(date, beforeId))

    if (prior.length === 0) return 0
    return prior[prior.length - 1]!.balanceAfter
  }

  function syncCustomerBalance(customerId: number, balance: number, tx: DbLike): void {
    balanceService.upsertSummary(
      customerId,
      {
        balance,
        bottlesWithCustomer: balanceService.computeLiveBottles(customerId, tx),
      },
      tx,
    )
  }

  function appendEntry(tx: DbLike, input: AppendEntryInput): LedgerRow {
    assertBusinessDate(input.date)
    if (input.debit < 0 || input.credit < 0) {
      throw new AppError('VALIDATION_FAILED', 'Ledger debit/credit cannot be negative')
    }
    if (input.debit === 0 && input.credit === 0) {
      throw new AppError('VALIDATION_FAILED', 'Ledger entry must have a non-zero debit or credit')
    }
    if (input.debit > 0 && input.credit > 0) {
      throw new AppError('VALIDATION_FAILED', 'Ledger entry cannot have both debit and credit')
    }

    const now = nowIsoUtc()
    const inserted = tx
      .insert(ledgerEntries)
      .values({
        uuid: newUuid(),
        customerId: input.customerId,
        entryDate: input.date,
        entryType: input.type,
        debit: input.debit,
        credit: input.credit,
        // Temporary; recomputed immediately below.
        balanceAfter: 0,
        description: input.description,
        refTable: input.refTable ?? null,
        refId: input.refId ?? null,
        createdAt: now,
        createdBy: input.createdBy ?? null,
      })
      .returning()
      .get()

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to insert ledger entry')
    }

    const priorBalance = balanceBefore(input.customerId, input.date, inserted.id, tx)
    const finalBalance = recomputeFrom(input.customerId, input.date, inserted.id, priorBalance, tx)

    syncCustomerBalance(input.customerId, finalBalance, tx)

    const row = tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, inserted.id)).get()!
    return toRow(row)
  }

  function toRow(row: typeof ledgerEntries.$inferSelect): LedgerRow {
    const entryType = row.entryType as LedgerEntryType
    return {
      id: row.id,
      uuid: row.uuid,
      customerId: row.customerId,
      entryDate: row.entryDate,
      entryType,
      debit: row.debit,
      credit: row.credit,
      balanceAfter: row.balanceAfter,
      description: row.description,
      refTable: row.refTable,
      refId: row.refId,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      isNonRevenue: NON_REVENUE_ENTRY_TYPES.has(entryType),
    }
  }

  function getLedger(customerId: number, opts: { from?: string; to?: string } = {}): LedgerRow[] {
    if (opts.from) assertBusinessDate(opts.from)
    if (opts.to) assertBusinessDate(opts.to)

    const conditions = [eq(ledgerEntries.customerId, customerId)]
    if (opts.from) conditions.push(gte(ledgerEntries.entryDate, opts.from))
    if (opts.to) conditions.push(lte(ledgerEntries.entryDate, opts.to))

    return db
      .select()
      .from(ledgerEntries)
      .where(and(...conditions))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id))
      .all()
      .map(toRow)
  }

  function getBalance(customerId: number, asOf?: string): Paisa {
    if (asOf) assertBusinessDate(asOf)
    return naiveAggregate(customerId, db, asOf) as Paisa
  }

  /**
   * Append void_reversal rows for every non-already-reversed entry matching ref.
   * Restores the ledger to the pre-document balance.
   */
  function reverseEntriesFor(
    tx: DbLike,
    refTable: string,
    refId: number,
    reason: string,
    createdBy?: number | null,
  ): LedgerRow[] {
    const originals = tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.refTable, refTable), eq(ledgerEntries.refId, refId)))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id))
      .all()
      .filter((r) => r.entryType !== 'void_reversal')

    const reversed: LedgerRow[] = []
    for (const entry of originals) {
      const already = tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.entryType, 'void_reversal'),
            eq(ledgerEntries.refTable, 'ledger_entries'),
            eq(ledgerEntries.refId, entry.id),
          ),
        )
        .get()
      if (already) continue

      reversed.push(
        appendEntry(tx, {
          customerId: entry.customerId,
          date: entry.entryDate,
          type: 'void_reversal',
          debit: entry.credit,
          credit: entry.debit,
          description: `Void: ${entry.description}${reason ? ` — ${reason}` : ''}`,
          refTable: 'ledger_entries',
          refId: entry.id,
          createdBy,
        }),
      )
    }
    return reversed
  }

  /** Rebuild balance_after chain from scratch. Returns how many rows changed. */
  function recalculateLedger(customerId: number): { changed: number; balance: number } {
    let changed = 0
    let balance = 0
    db.transaction((tx) => {
      const rows = tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.customerId, customerId))
        .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id))
        .all()

      let running = 0
      for (const row of rows) {
        running = running + row.debit - row.credit
        if (row.balanceAfter !== running) {
          tx.update(ledgerEntries)
            .set({ balanceAfter: running })
            .where(eq(ledgerEntries.id, row.id))
            .run()
          changed += 1
        }
      }
      balance = running
      syncCustomerBalance(customerId, balance, tx)
    })
    return { changed, balance }
  }

  /** Sum of debit−credit excluding deposit types — used by revenue helpers, not AR. */
  function revenueExcludedBalance(customerId: number, tx: DbLike = db): number {
    const rows = tx
      .select({ debit: ledgerEntries.debit, credit: ledgerEntries.credit })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, customerId),
          sql`${ledgerEntries.entryType} NOT IN ('deposit_received', 'deposit_refunded')`,
        ),
      )
      .all()
    return rows.reduce((sum, r) => sum + r.debit - r.credit, 0)
  }

  return {
    appendEntry,
    getLedger,
    getBalance,
    reverseEntriesFor,
    recalculateLedger,
    naiveAggregate,
    revenueExcludedBalance,
    NON_REVENUE_ENTRY_TYPES,
  }
}

export type LedgerService = ReturnType<typeof createLedgerService>
