export const SETTING_DEFAULTS = {
  'business.name': '',
  'business.logoPath': '',
  'business.address': '',
  'business.phone': '',
  'business.phone2': '',
  'business.email': '',
  'business.bankDetails': '',
  'business.taxNumber': '',
  'locale.currencyCode': 'PKR',
  'locale.currencySymbol': 'Rs',
  'locale.decimalPlaces': 0,
  'locale.dateFormat': 'dd-MM-yyyy',
  'invoice.numberPrefix': 'INV',
  'invoice.numberFormat': '{prefix}-{YYYY}-{MM}-{seq:4}',
  'invoice.dueDays': 10,
  'invoice.footerNote': '',
  'invoice.showBottleBalance': true,
  'billing.defaultBillingDay': 1,
  'tax.enabled': false,
  'tax.rate': 0,
  'backup.folder': '',
  'backup.onExit': true,
  'backup.daily': true,
  'backup.weekly': true,
  'backup.keepDaily': 14,
  'backup.keepWeekly': 8,
  'backup.secondaryFolder': '',
  'security.autoLockMinutes': 15,
  'inventory.lowStockThreshold': 0,
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K]

export const OWNER_ONLY_SETTING_PREFIXES = ['business.', 'backup.', 'security.', 'tax.'] as const

export function isOwnerOnlySetting(key: string): boolean {
  return OWNER_ONLY_SETTING_PREFIXES.some((p) => key.startsWith(p))
}
