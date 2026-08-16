/** Report columns stored in paisa that must render with <Money>, not raw integers. */
export const MONEY_COLUMN_KEYS = new Set([
  'value',
  'revenue',
  'total',
  'amount',
  'balance',
  'expenses',
  'netProfit',
  'netRevenue',
  'totalExpenses',
  'cashCollected',
  'paymentsTotal',
  'walkInCash',
  'costPerBottle',
  'averageRevenuePerBottle',
  'marginPerBottle',
  'averagePerDelivery',
  'averageRevenuePerCustomer',
  'cashVariance',
  'totalOutstanding',
  'totalCredit',
])

export function isMoneyColumn(key: string): boolean {
  if (MONEY_COLUMN_KEYS.has(key)) return true
  if (key.startsWith('average') && /revenue|delivery|bottle|customer|amount/i.test(key)) {
    return true
  }
  return false
}
