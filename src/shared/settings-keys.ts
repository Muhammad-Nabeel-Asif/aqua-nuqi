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
  'invoice.showRateColumn': true,
  'invoice.accentColour': '#0284c7',
  'invoice.termsText':
    'Payment is due by the due date. Late payments may attract additional charges.',
  'invoice.defaultPageSize': 'A4',
  'invoice.whatsappTemplate':
    'Assalam-o-Alaikum {customerName},\n\nYour water bill for {period} is ready.\nUnits: {units}\nThis month: {amount}\nPrevious balance: {previousBalance}\n*Total payable: {totalPayable}*\nDue: {dueDate}\n\n— {businessName}',
  'invoice.emailSubjectTemplate': 'Invoice {period} — {businessName}',
  'invoice.emailBodyTemplate':
    'Dear {customerName},\n\nPlease find your bill for {period}.\nTotal payable: {totalPayable}\nDue date: {dueDate}\n\nRegards,\n{businessName}',
  'documents.folder': '',
  'locale.numberingSystem': 'lakh_crore',
  'print.defaultPrinter': '',
  'print.defaultThermalPrinter': '',
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
  'deliveries.missedDaysThreshold': 10,
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K]

export const OWNER_ONLY_SETTING_PREFIXES = ['business.', 'backup.', 'security.', 'tax.'] as const

export function isOwnerOnlySetting(key: string): boolean {
  return OWNER_ONLY_SETTING_PREFIXES.some((p) => key.startsWith(p))
}
