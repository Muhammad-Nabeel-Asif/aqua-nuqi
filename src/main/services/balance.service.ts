import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import { customerBalances, customers, ledgerEntries } from '@main/db/schema'
import { nowIsoUtc } from '@shared/date'

type DbLike = AppDatabase

/**
 * Materialised customer_balances helpers.
 *
 * Money truth = Σ ledger debit − Σ ledger credit (includes opening_balance / void_reversal).
 * Deposits (deposit_received / deposit_refunded) are excluded from AR — held separately in
 * customers.security_deposit_held and omitted from revenue (FR-BL-14).
 * Bottles = opening_bottles + Σ deliveries − Σ empties − Σ lost/damaged
 * (delivery/adjustment tables arrive in later phases; queries no-op until then).
 */
export function createBalanceService(db: AppDatabase, raw: RawDatabase) {
  function tableExists(name: string): boolean {
    const row = raw
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) as { ok: number } | undefined
    return Boolean(row)
  }

  function computeLiveBalance(customerId: number, tx: DbLike = db): number {
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

  function computeLiveBottles(customerId: number, tx: DbLike = db): number {
    const customer = tx.select().from(customers).where(eq(customers.id, customerId)).get()
    if (!customer) return 0

    let delivered = 0
    let empties = 0
    let lost = 0

    if (tableExists('deliveries')) {
      const row = raw
        .prepare(
          `SELECT
             coalesce(sum(case when status = 'recorded' then quantity else 0 end), 0) as delivered,
             coalesce(sum(case when status = 'recorded' then empties_collected else 0 end), 0) as empties
           FROM deliveries WHERE customer_id = ?`,
        )
        .get(customerId) as { delivered: number; empties: number }
      delivered = Number(row.delivered)
      empties = Number(row.empties)
    }

    if (tableExists('customer_adjustments')) {
      const row = raw
        .prepare(
          `SELECT coalesce(sum(quantity), 0) as lost
           FROM customer_adjustments
           WHERE customer_id = ?
             AND status = 'active'
             AND kind IN ('damaged_bottle','lost_bottle')`,
        )
        .get(customerId) as { lost: number }
      lost = Number(row.lost)
    }

    return customer.openingBottles + delivered - empties - lost
  }

  function upsertSummary(
    customerId: number,
    values: {
      balance: number
      bottlesWithCustomer: number
      lastDeliveryDate?: string | null
      lastPaymentDate?: string | null
      lastInvoiceId?: number | null
    },
    tx: DbLike = db,
  ): void {
    const now = nowIsoUtc()
    const existing = tx
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, customerId))
      .get()

    if (existing) {
      tx.update(customerBalances)
        .set({
          balance: values.balance,
          bottlesWithCustomer: values.bottlesWithCustomer,
          lastDeliveryDate:
            values.lastDeliveryDate !== undefined
              ? values.lastDeliveryDate
              : existing.lastDeliveryDate,
          lastPaymentDate:
            values.lastPaymentDate !== undefined
              ? values.lastPaymentDate
              : existing.lastPaymentDate,
          lastInvoiceId:
            values.lastInvoiceId !== undefined ? values.lastInvoiceId : existing.lastInvoiceId,
          updatedAt: now,
        })
        .where(eq(customerBalances.customerId, customerId))
        .run()
    } else {
      tx.insert(customerBalances)
        .values({
          customerId,
          balance: values.balance,
          bottlesWithCustomer: values.bottlesWithCustomer,
          lastDeliveryDate: values.lastDeliveryDate ?? null,
          lastPaymentDate: values.lastPaymentDate ?? null,
          lastInvoiceId: values.lastInvoiceId ?? null,
          updatedAt: now,
        })
        .run()
    }
  }

  function syncFromSources(customerId: number, tx: DbLike = db): void {
    upsertSummary(
      customerId,
      {
        balance: computeLiveBalance(customerId, tx),
        bottlesWithCustomer: computeLiveBottles(customerId, tx),
      },
      tx,
    )
  }

  /** Rebuild customer_balances from source tables. */
  function recalculate(customerId?: number): { updated: number } {
    const ids = customerId
      ? [customerId]
      : db
          .select({ id: customers.id })
          .from(customers)
          .where(isNull(customers.deletedAt))
          .all()
          .map((r) => r.id)

    let updated = 0
    db.transaction((tx) => {
      for (const id of ids) {
        syncFromSources(id, tx)
        updated += 1
      }
    })
    return { updated }
  }

  return {
    computeLiveBalance,
    computeLiveBottles,
    upsertSummary,
    syncFromSources,
    recalculate,
  }
}

export type BalanceService = ReturnType<typeof createBalanceService>
