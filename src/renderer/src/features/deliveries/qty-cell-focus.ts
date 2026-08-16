/** Qty cells must not pull the caret out of Search or other toolbar fields. */
export function qtyCellMayTakeFocus(
  active: { tagName?: string } | null,
  self: object | null,
): boolean {
  if (!active || active === self) return true
  const tag = active.tagName
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT'
}
