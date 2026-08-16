/** Qty cells must not pull the caret out of Search or other toolbar fields. */
export function qtyCellMayTakeFocus(
  active: { tagName?: string; getAttribute?: (name: string) => string | null } | null,
  self: object | null,
): boolean {
  if (!active || active === self) return true
  // Keyboard move (Tab / arrows) leaves the previous qty input focused until we take over.
  if (active.getAttribute?.('data-delivery-cell')) return true
  const tag = active.tagName
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT'
}
