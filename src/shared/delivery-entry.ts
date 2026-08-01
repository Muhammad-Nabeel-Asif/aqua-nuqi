/**
 * Matrix / customer-card qty-cell upsert patch.
 * - Clear (null/0) must void: force emptiesCollected = 0 (daily entry does the same).
 * - Positive qty omits empties so independent empties survive on update;
 *   the service defaults empties = qty only on insert.
 */
export function matrixCardQtyUpsert(quantity: number | null): {
  quantity: number
  emptiesCollected?: number
} {
  const qty = quantity ?? 0
  if (qty === 0) return { quantity: 0, emptiesCollected: 0 }
  return { quantity: qty }
}
