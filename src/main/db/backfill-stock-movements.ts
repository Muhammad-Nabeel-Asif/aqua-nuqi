import { randomUUID } from 'node:crypto'
import type { RawDatabase } from './client'

/**
 * Idempotent backfill: generate stock_movements for historical deliveries,
 * customer opening bottles, and lost/damaged adjustments that pre-date Phase 7.
 *
 * Safe to run on every boot — skips refs that already have movements.
 * Returns how many movement rows were inserted.
 */
export function backfillStockMovements(raw: RawDatabase): number {
  const table = raw
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stock_movements'`)
    .get() as { name: string } | undefined
  if (!table) return 0

  const now = new Date().toISOString()
  let created = 0

  // 1) Customer opening bottles → filled: none → customer (opening_stock)
  const openings = raw
    .prepare(
      `SELECT id, opening_bottles, opening_as_of, joined_on, created_at
       FROM customers
       WHERE deleted_at IS NULL AND opening_bottles > 0`,
    )
    .all() as Array<{
    id: number
    opening_bottles: number
    opening_as_of: string | null
    joined_on: string | null
    created_at: string
  }>

  const defaultProduct = raw
    .prepare(`SELECT id FROM products WHERE is_default = 1 AND deleted_at IS NULL LIMIT 1`)
    .get() as { id: number } | undefined
  if (!defaultProduct) return 0

  const insert = raw.prepare(
    `INSERT INTO stock_movements (
       uuid, movement_date, product_id, bottle_state, quantity,
       from_location, to_location, vehicle_id, customer_id, reason,
       ref_table, ref_id, notes, created_at, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)`,
  )

  const exists = raw.prepare(
    `SELECT 1 AS ok FROM stock_movements
     WHERE ref_table = ? AND ref_id = ? AND reason = ? LIMIT 1`,
  )

  for (const c of openings) {
    if (exists.get('customers', c.id, 'opening_stock')) continue
    const date = c.opening_as_of ?? c.joined_on ?? c.created_at.slice(0, 10)
    insert.run(
      randomUUID(),
      date,
      defaultProduct.id,
      'filled',
      c.opening_bottles,
      'none',
      'customer',
      c.id,
      'opening_stock',
      'customers',
      c.id,
      'Backfill: opening bottles with customer',
      now,
    )
    created += 1
  }

  // 2) Recorded deliveries → delivery + empty_pickup
  const dels = raw
    .prepare(
      `SELECT id, customer_id, product_id, delivery_date, quantity, empties_collected, trip_id
       FROM deliveries WHERE status = 'recorded'`,
    )
    .all() as Array<{
    id: number
    customer_id: number
    product_id: number
    delivery_date: string
    quantity: number
    empties_collected: number
    trip_id: number | null
  }>

  for (const d of dels) {
    // Trips didn't exist historically — plant ↔ customer.
    if (d.quantity > 0 && !exists.get('deliveries', d.id, 'delivery')) {
      insert.run(
        randomUUID(),
        d.delivery_date,
        d.product_id,
        'filled',
        d.quantity,
        'plant',
        'customer',
        d.customer_id,
        'delivery',
        'deliveries',
        d.id,
        'Backfill: delivery',
        now,
      )
      created += 1
    }
    if (d.empties_collected > 0 && !exists.get('deliveries', d.id, 'empty_pickup')) {
      insert.run(
        randomUUID(),
        d.delivery_date,
        d.product_id,
        'empty',
        d.empties_collected,
        'customer',
        'plant',
        d.customer_id,
        'empty_pickup',
        'deliveries',
        d.id,
        'Backfill: empty pickup',
        now,
      )
      created += 1
    }
  }

  // 3) Lost / damaged bottle adjustments → customer → scrap
  const adjs = raw
    .prepare(
      `SELECT id, customer_id, adjustment_date, kind, quantity
       FROM customer_adjustments
       WHERE status = 'active'
         AND kind IN ('lost_bottle','damaged_bottle')
         AND quantity IS NOT NULL AND quantity > 0`,
    )
    .all() as Array<{
    id: number
    customer_id: number
    adjustment_date: string
    kind: string
    quantity: number
  }>

  for (const a of adjs) {
    const reason = a.kind === 'lost_bottle' ? 'lost' : 'damaged'
    if (exists.get('customer_adjustments', a.id, reason)) continue
    insert.run(
      randomUUID(),
      a.adjustment_date,
      defaultProduct.id,
      'filled',
      a.quantity,
      'customer',
      'scrap',
      a.customer_id,
      reason,
      'customer_adjustments',
      a.id,
      `Backfill: ${a.kind}`,
      now,
    )
    created += 1
  }

  if (created > 0) {
    // eslint-disable-next-line no-console
    console.log(`[aqua-nuqi] stock_movements backfill created ${created} row(s)`)
  }
  return created
}
