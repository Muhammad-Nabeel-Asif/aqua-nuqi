import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const period = z.string().regex(/^\d{4}-\d{2}$/)

export const deliveryStatusSchema = z.enum(['recorded', 'void'])

export const deliveryDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  customerId: z.number().int(),
  customerCode: z.string().optional(),
  customerName: z.string().optional(),
  productId: z.number().int(),
  deliveryDate: businessDate,
  quantity: z.number().int().nonnegative(),
  emptiesCollected: z.number().int().nonnegative(),
  rate: z.number().int(),
  amount: z.number().int(),
  isFree: z.boolean(),
  freeReason: z.string().nullable(),
  employeeId: z.number().int().nullable(),
  tripId: z.number().int().nullable(),
  cashCollected: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  status: deliveryStatusSchema,
  voidReason: z.string().nullable(),
  invoiceId: z.number().int().nullable(),
  locked: z.boolean(),
  periodClosed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().int().nullable(),
  updatedBy: z.number().int().nullable(),
})
export type DeliveryDto = z.infer<typeof deliveryDto>

export const upsertDeliveryInput = z.object({
  customerId: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  date: businessDate,
  quantity: z.number().int().nonnegative(),
  emptiesCollected: z.number().int().nonnegative().optional(),
  employeeId: z.number().int().positive().nullable().optional(),
  isFree: z.boolean().optional(),
  freeReason: z.string().nullable().optional(),
  cashCollected: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  /** Explicit rate override (paisa). Keeps original rate when omitted on update. */
  rate: z.number().int().nonnegative().optional(),
  rateOverrideReason: z.string().nullable().optional(),
})
export type UpsertDeliveryInput = z.infer<typeof upsertDeliveryInput>

export const upsertDeliveryOutput = z.object({ item: deliveryDto })
export type UpsertDeliveryOutput = z.infer<typeof upsertDeliveryOutput>

export const voidDeliveryInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1),
})
export type VoidDeliveryInput = z.infer<typeof voidDeliveryInput>

export const voidDeliveryOutput = z.object({ item: deliveryDto })
export type VoidDeliveryOutput = z.infer<typeof voidDeliveryOutput>

export const getDeliveryInput = z.object({ id: z.number().int().positive() })
export const getDeliveryOutput = z.object({ item: deliveryDto })

export const dayListFilters = z.object({
  date: businessDate,
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'paused', 'inactive']).optional(),
  productId: z.number().int().positive().optional(),
})
export type DayListFilters = z.infer<typeof dayListFilters>

export const dayListRowDto = z.object({
  customerId: z.number().int(),
  code: z.string(),
  name: z.string(),
  areaId: z.number().int().nullable(),
  areaName: z.string().nullable(),
  routeId: z.number().int().nullable(),
  routeName: z.string().nullable(),
  routeSortOrder: z.number().int(),
  rate: z.number().int(),
  billingMode: z.enum(['per_bottle', 'monthly_package']),
  suggestedQty: z.number().int().nullable(),
  deliveryId: z.number().int().nullable(),
  quantity: z.number().int().nullable(),
  emptiesCollected: z.number().int().nullable(),
  amount: z.number().int().nullable(),
  cashCollected: z.number().int().nullable(),
  notes: z.string().nullable(),
  isFree: z.boolean(),
  locked: z.boolean(),
  periodClosed: z.boolean(),
  bottlesWithCustomer: z.number().int(),
  phonePrimary: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
})
export type DayListRowDto = z.infer<typeof dayListRowDto>

export const getDayListInput = dayListFilters
export const getDayListOutput = z.object({
  date: businessDate,
  periodClosed: z.boolean(),
  items: z.array(dayListRowDto),
  totals: z.object({
    customersServed: z.number().int(),
    totalBottles: z.number().int(),
    totalEmpties: z.number().int(),
    totalAmount: z.number().int(),
    totalCash: z.number().int(),
  }),
})
export type GetDayListOutput = z.infer<typeof getDayListOutput>

export const monthGridCellDto = z.object({
  day: z.number().int().min(1).max(31),
  quantity: z.number().int(),
  emptiesCollected: z.number().int(),
  amount: z.number().int(),
  deliveryId: z.number().int(),
  locked: z.boolean(),
  hasNote: z.boolean(),
  emptiesDiffer: z.boolean(),
})
export type MonthGridCellDto = z.infer<typeof monthGridCellDto>

export const monthGridRowDto = z.object({
  customerId: z.number().int(),
  code: z.string(),
  name: z.string(),
  areaName: z.string().nullable(),
  routeName: z.string().nullable(),
  rate: z.number().int(),
  cells: z.array(monthGridCellDto),
  totalUnits: z.number().int(),
  totalAmount: z.number().int(),
  totalEmpties: z.number().int(),
})
export type MonthGridRowDto = z.infer<typeof monthGridRowDto>

export const getMonthGridInput = z.object({
  period,
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  status: z.enum(['active', 'paused', 'inactive']).optional(),
  search: z.string().optional(),
  productId: z.number().int().positive().optional(),
})
export type GetMonthGridInput = z.infer<typeof getMonthGridInput>

export const getMonthGridOutput = z.object({
  period,
  daysInMonth: z.number().int(),
  periodClosed: z.boolean(),
  rows: z.array(monthGridRowDto),
  dayTotals: z.array(
    z.object({
      day: z.number().int(),
      totalUnits: z.number().int(),
      totalAmount: z.number().int(),
    }),
  ),
  grandTotalUnits: z.number().int(),
  grandTotalAmount: z.number().int(),
})
export type GetMonthGridOutput = z.infer<typeof getMonthGridOutput>

export const customerCardDayDto = z.object({
  date: businessDate,
  day: z.number().int(),
  quantity: z.number().int().nullable(),
  emptiesCollected: z.number().int().nullable(),
  amount: z.number().int().nullable(),
  deliveryId: z.number().int().nullable(),
  locked: z.boolean(),
  notes: z.string().nullable(),
})
export type CustomerCardDayDto = z.infer<typeof customerCardDayDto>

export const getCustomerCardInput = z.object({
  customerId: z.number().int().positive(),
  period,
  productId: z.number().int().positive().optional(),
})
export type GetCustomerCardInput = z.infer<typeof getCustomerCardInput>

export const getCustomerCardOutput = z.object({
  customerId: z.number().int(),
  code: z.string(),
  name: z.string(),
  period,
  rate: z.number().int(),
  periodClosed: z.boolean(),
  days: z.array(customerCardDayDto),
  totalUnits: z.number().int(),
  totalAmount: z.number().int(),
  totalEmpties: z.number().int(),
  bottlesWithCustomer: z.number().int(),
  lastDeliveryDate: z.string().nullable(),
  balance: z.number().int(),
})
export type GetCustomerCardOutput = z.infer<typeof getCustomerCardOutput>

export const deliverySummaryInput = z.object({
  from: businessDate,
  to: businessDate,
  groupBy: z.enum(['day', 'route', 'area', 'customer']).default('day'),
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
})
export type DeliverySummaryInput = z.infer<typeof deliverySummaryInput>

export const deliverySummaryOutput = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      customersServed: z.number().int(),
      totalUnits: z.number().int(),
      totalEmpties: z.number().int(),
      totalAmount: z.number().int(),
    }),
  ),
})
export type DeliverySummaryOutput = z.infer<typeof deliverySummaryOutput>

export const copyPreviousDayInput = z.object({
  date: businessDate,
  routeId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
})
export const copyPreviousDayOutput = z.object({
  sourceDate: businessDate.nullable(),
  items: z.array(
    z.object({
      customerId: z.number().int(),
      quantity: z.number().int(),
      emptiesCollected: z.number().int(),
    }),
  ),
})

export const walkInSaleInput = z.object({
  date: businessDate,
  quantity: z.number().int().positive(),
  rate: z.number().int().nonnegative().optional(),
  cashCollected: z.number().int().nonnegative().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().nullable().optional(),
})
export type WalkInSaleInput = z.infer<typeof walkInSaleInput>
export const walkInSaleOutput = z.object({ item: deliveryDto })

export const bottlesOutInput = z.object({
  search: z.string().optional(),
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  minBottles: z.number().int().nonnegative().optional(),
})
export const bottlesOutOutput = z.object({
  items: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      phonePrimary: z.string().nullable(),
      whatsappNumber: z.string().nullable(),
      areaName: z.string().nullable(),
      routeName: z.string().nullable(),
      bottlesWithCustomer: z.number().int(),
      securityDepositHeld: z.number().int(),
      defaultDeposit: z.number().int(),
      depositShortfall: z.boolean(),
      lastDeliveryDate: z.string().nullable(),
      daysSinceLastReturn: z.number().int().nullable(),
    }),
  ),
})
export type BottlesOutOutput = z.infer<typeof bottlesOutOutput>

export const missedDeliveriesInput = z.object({
  asOf: businessDate.optional(),
  thresholdDays: z.number().int().positive().optional(),
  routeId: z.number().int().positive().optional(),
})
export const missedDeliveriesOutput = z.object({
  items: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      phonePrimary: z.string().nullable(),
      whatsappNumber: z.string().nullable(),
      routeName: z.string().nullable(),
      lastDeliveryDate: z.string().nullable(),
      daysSince: z.number().int().nullable(),
      reason: z.enum(['schedule_overdue', 'no_delivery_n_days']),
    }),
  ),
})
export type MissedDeliveriesOutput = z.infer<typeof missedDeliveriesOutput>

export const recordBottleLossInput = z.object({
  customerId: z.number().int().positive(),
  date: businessDate,
  kind: z.enum(['damaged_bottle', 'lost_bottle']),
  quantity: z.number().int().positive(),
  amount: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
})
export type RecordBottleLossInput = z.infer<typeof recordBottleLossInput>
export const recordBottleLossOutput = z.object({
  id: z.number().int(),
  bottlesWithCustomer: z.number().int(),
})

export const exportMonthGridInput = getMonthGridInput.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
})
export const exportMonthGridOutput = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
})

export const todaySummaryInput = z.object({
  date: businessDate.optional(),
})
export const todaySummaryOutput = z.object({
  customersServed: z.number().int(),
  totalBottles: z.number().int(),
  totalAmount: z.number().int(),
})

export type CopyPreviousDayOutput = z.infer<typeof copyPreviousDayOutput>
