/** On-screen words a plant owner would say. Keep raw codes in data/API only. */

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  residential: 'Home',
  commercial: 'Shop or office',
  walk_in: 'Walk-in (counter)',
}

export const BILLING_MODE_LABEL: Record<string, string> = {
  per_bottle: 'Per bottle',
  monthly_package: 'Monthly package',
}

export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  inactive: 'Inactive',
}

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  operator: 'Data entry staff',
  viewer: 'View only',
}

export const ATTENDANCE_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  paid_leave: 'Leave',
  unpaid_leave: 'Unpaid',
  holiday: 'Off',
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'Sent',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  void: 'Cancelled',
}

export function plainLabel(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—'
  return map[value] ?? value.replace(/_/g, ' ')
}

export const PRODUCT_KIND_LABEL: Record<string, string> = {
  returnable_bottle: 'Returnable bottle',
  packaged_water: 'Packaged water',
  equipment: 'Equipment',
  rental: 'Rental',
  service: 'Service',
}

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  loader: 'Loader',
  rickshaw: 'Rickshaw',
  bike: 'Bike',
  van: 'Van',
  truck: 'Truck',
  other: 'Other',
}

export const BILL_SKIP_REASON_LABEL: Record<string, string> = {
  INVOICE_EXISTS: 'Bill already sent for this month',
}

export function billSkipReasonLabel(reason: string | null | undefined): string {
  if (!reason) return ''
  return BILL_SKIP_REASON_LABEL[reason] ?? reason
}
