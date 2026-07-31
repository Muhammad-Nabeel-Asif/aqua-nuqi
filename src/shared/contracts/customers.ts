import { z } from 'zod'

export const customerTypeSchema = z.enum(['residential', 'commercial', 'walk_in'])
export const billingModeSchema = z.enum(['per_bottle', 'monthly_package'])
export const customerStatusSchema = z.enum(['active', 'paused', 'inactive'])
export const scheduleModeSchema = z.enum(['weekdays', 'interval_days', 'on_call'])

export const customerScheduleDto = z.object({
  mode: scheduleModeSchema,
  weekdays: z.string().nullable(),
  intervalDays: z.number().int().nullable(),
  defaultQty: z.number().int(),
})
export type CustomerScheduleDto = z.infer<typeof customerScheduleDto>

export const customerRateDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  customerId: z.number().int(),
  productId: z.number().int(),
  rate: z.number().int(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
})
export type CustomerRateDto = z.infer<typeof customerRateDto>

export const customerDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  code: z.string(),
  name: z.string(),
  customerType: customerTypeSchema,
  phonePrimary: z.string().nullable(),
  phoneSecondary: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  landmark: z.string().nullable(),
  areaId: z.number().int().nullable(),
  areaName: z.string().nullable(),
  routeId: z.number().int().nullable(),
  routeName: z.string().nullable(),
  deliveryNotes: z.string().nullable(),
  billingMode: billingModeSchema,
  packageAmount: z.number().int().nullable(),
  packageIncludedQty: z.number().int().nullable(),
  packageExcessRate: z.number().int().nullable(),
  billingDay: z.number().int().nullable(),
  creditLimit: z.number().int().nullable(),
  securityDepositHeld: z.number().int(),
  openingBottles: z.number().int(),
  openingBalance: z.number().int(),
  openingAsOf: z.string().nullable(),
  status: customerStatusSchema,
  pausedFrom: z.string().nullable(),
  pausedTo: z.string().nullable(),
  statusReason: z.string().nullable(),
  joinedOn: z.string().nullable(),
  notes: z.string().nullable(),
  balance: z.number().int(),
  bottlesWithCustomer: z.number().int(),
  currentRate: z.number().int().nullable(),
  schedule: customerScheduleDto.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CustomerDto = z.infer<typeof customerDto>

export const customerListItemDto = customerDto.pick({
  id: true,
  uuid: true,
  code: true,
  name: true,
  customerType: true,
  phonePrimary: true,
  areaId: true,
  areaName: true,
  routeId: true,
  routeName: true,
  status: true,
  balance: true,
  bottlesWithCustomer: true,
  currentRate: true,
  billingMode: true,
})
export type CustomerListItemDto = z.infer<typeof customerListItemDto>

export const listCustomersInput = z.object({
  search: z.string().optional(),
  areaId: z.number().int().positive().optional(),
  routeId: z.number().int().positive().optional(),
  status: customerStatusSchema.optional(),
  customerType: customerTypeSchema.optional(),
  hasOutstanding: z.boolean().optional(),
  holdsBottles: z.boolean().optional(),
  sortBy: z
    .enum(['code', 'name', 'phone', 'area', 'route', 'rate', 'bottles', 'balance', 'status'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().min(0).optional(),
})
export type ListCustomersInput = z.infer<typeof listCustomersInput>

export const listCustomersOutput = z.object({
  items: z.array(customerListItemDto),
  total: z.number().int(),
})

const optionalPhone = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^[\d+\-\s()]{7,20}$/, 'Invalid phone format'),
  ])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : v))

const optionalEmail = z
  .union([z.literal(''), z.string().trim().email()])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : v))

export const customerWriteFields = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(40).optional(),
  customerType: customerTypeSchema.default('residential'),
  phonePrimary: optionalPhone,
  phoneSecondary: optionalPhone,
  whatsappNumber: optionalPhone,
  email: optionalEmail,
  addressLine: z.string().trim().max(500).optional().nullable(),
  landmark: z.string().trim().max(200).optional().nullable(),
  areaId: z.number().int().positive().optional().nullable(),
  routeId: z.number().int().positive().optional().nullable(),
  deliveryNotes: z.string().trim().max(1000).optional().nullable(),
  billingMode: billingModeSchema.default('per_bottle'),
  packageAmount: z.number().int().min(0).optional().nullable(),
  packageIncludedQty: z.number().int().min(0).optional().nullable(),
  packageExcessRate: z.number().int().min(0).optional().nullable(),
  billingDay: z.number().int().min(1).max(28).optional().nullable(),
  creditLimit: z.number().int().min(0).optional().nullable(),
  securityDepositHeld: z.number().int().min(0).optional(),
  openingBottles: z.number().int().min(0).optional(),
  openingBalance: z.number().int().optional(),
  openingAsOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  status: customerStatusSchema.optional(),
  pausedFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  pausedTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  statusReason: z.string().trim().max(500).optional().nullable(),
  joinedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Initial per-bottle rate in paisa (creates the first customer_rates row). */
  rate: z.number().int().min(0).optional(),
  productId: z.number().int().positive().optional(),
  schedule: customerScheduleDto.optional().nullable(),
})

export const createCustomerInput = customerWriteFields
/** Input shape (optional phones/defaults) — use after Zod parse for the full output. */
export type CreateCustomerInput = z.input<typeof createCustomerInput>
export const createCustomerOutput = z.object({ item: customerDto })

export const updateCustomerInput = customerWriteFields.partial().extend({
  id: z.number().int().positive(),
})
export type UpdateCustomerInput = z.input<typeof updateCustomerInput>
export const updateCustomerOutput = z.object({ item: customerDto })

export const getCustomerInput = z.object({ id: z.number().int().positive() })
export const getCustomerOutput = z.object({
  item: customerDto,
  rateHistory: z.array(customerRateDto),
  openingsEditable: z.boolean(),
})

export const setCustomerStatusInput = z.object({
  id: z.number().int().positive(),
  status: customerStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
  pausedFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  pausedTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
})
export const setCustomerStatusOutput = z.object({ item: customerDto })

export const bulkUpdateCustomersInput = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  areaId: z.number().int().positive().optional().nullable(),
  routeId: z.number().int().positive().optional().nullable(),
  status: customerStatusSchema.optional(),
})
export const bulkUpdateCustomersOutput = z.object({ updated: z.number().int() })

export const nextCustomerCodeInput = z.object({})
export const nextCustomerCodeOutput = z.object({ code: z.string() })

export const searchCustomersInput = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().positive().max(50).optional(),
})
export const searchCustomersOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      code: z.string(),
      name: z.string(),
      phonePrimary: z.string().nullable(),
      addressLine: z.string().nullable(),
    }),
  ),
})

export const customerAuditInput = z.object({
  customerId: z.number().int().positive(),
  limit: z.number().int().positive().max(200).optional(),
})
export const customerAuditOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      occurredAt: z.string(),
      action: z.string(),
      summary: z.string(),
      beforeJson: z.string().nullable(),
      afterJson: z.string().nullable(),
    }),
  ),
})

export const changeRateInput = z.object({
  customerId: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  rate: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(500).optional().nullable(),
  forceClosedPeriod: z.boolean().optional(),
})
export type ChangeRateInput = z.infer<typeof changeRateInput>
export const changeRateOutput = z.object({
  item: customerRateDto,
  warning: z.string().nullable(),
})

export const bulkChangeRateInput = z.object({
  customerIds: z.array(z.number().int().positive()).min(1),
  productId: z.number().int().positive().optional(),
  rate: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(500).optional().nullable(),
})
export const bulkChangeRateOutput = z.object({
  created: z.number().int(),
  items: z.array(customerRateDto),
})

export const previewBulkRateInput = z.object({
  areaId: z.number().int().positive().optional(),
  routeId: z.number().int().positive().optional(),
  customerType: customerTypeSchema.optional(),
  currentRate: z.number().int().optional(),
  productId: z.number().int().positive().optional(),
})
export const previewBulkRateOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      code: z.string(),
      name: z.string(),
      oldRate: z.number().int().nullable(),
    }),
  ),
})

export const getRateForInput = z.object({
  customerId: z.number().int().positive(),
  productId: z.number().int().positive(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export const getRateForOutput = z.object({ rate: z.number().int() })

export const recalculateBalancesInput = z.object({
  customerId: z.number().int().positive().optional(),
})
export const recalculateBalancesOutput = z.object({
  updated: z.number().int(),
})

export const exportCustomersInput = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
})
export const exportCustomersOutput = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
})
