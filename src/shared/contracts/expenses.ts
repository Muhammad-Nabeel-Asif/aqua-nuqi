import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const expensePaymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'cheque',
  'credit',
  'other',
])
export type ExpensePaymentMethod = z.infer<typeof expensePaymentMethodSchema>

export const expenseSourceSchema = z.enum(['manual', 'payroll', 'purchase', 'recurring'])
export type ExpenseSource = z.infer<typeof expenseSourceSchema>

export const expenseCategoryDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  parentId: z.number().int().nullable(),
  parentName: z.string().nullable(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  usageCount: z.number().int(),
  thisMonthTotal: z.number().int(),
  thisYearTotal: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ExpenseCategoryDto = z.infer<typeof expenseCategoryDto>

export const expenseDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  expenseDate: businessDate,
  categoryId: z.number().int(),
  categoryName: z.string(),
  amount: z.number().int(),
  paymentMethod: expensePaymentMethodSchema,
  vendorName: z.string().nullable(),
  description: z.string().nullable(),
  referenceNo: z.string().nullable(),
  attachmentPath: z.string().nullable(),
  employeeId: z.number().int().nullable(),
  vehicleId: z.number().int().nullable(),
  source: expenseSourceSchema,
  sourceRefTable: z.string().nullable(),
  sourceRefId: z.number().int().nullable(),
  status: z.enum(['active', 'void']),
  readOnly: z.boolean(),
  periodClosed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().int().nullable(),
  updatedBy: z.number().int().nullable(),
})
export type ExpenseDto = z.infer<typeof expenseDto>

export const recurringExpenseDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  categoryId: z.number().int(),
  categoryName: z.string(),
  amount: z.number().int(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  dayOfMonth: z.number().int().nullable(),
  vendorName: z.string().nullable(),
  nextDueDate: businessDate,
  lastRecordedDate: businessDate.nullable(),
  isActive: z.boolean(),
  isDue: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type RecurringExpenseDto = z.infer<typeof recurringExpenseDto>

export const categoryTotalDto = z.object({
  categoryId: z.number().int(),
  categoryName: z.string(),
  total: z.number().int(),
  count: z.number().int(),
  percent: z.number(),
})
export type CategoryTotalDto = z.infer<typeof categoryTotalDto>

export const monthTotalDto = z.object({
  period: z.string(),
  total: z.number().int(),
  count: z.number().int(),
})
export type MonthTotalDto = z.infer<typeof monthTotalDto>

export const vendorTotalDto = z.object({
  vendorName: z.string(),
  total: z.number().int(),
  count: z.number().int(),
})
export type VendorTotalDto = z.infer<typeof vendorTotalDto>

// ── Categories ────────────────────────────────────────────────────────

export const listExpenseCategoriesInput = z.object({
  includeInactive: z.boolean().optional(),
})
export const listExpenseCategoriesOutput = z.object({
  items: z.array(expenseCategoryDto),
})

export const createExpenseCategoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.number().int().positive().optional().nullable(),
})
export const createExpenseCategoryOutput = z.object({ item: expenseCategoryDto })

export const updateExpenseCategoryInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
})
export const updateExpenseCategoryOutput = z.object({ item: expenseCategoryDto })

export const reorderExpenseCategoriesInput = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
})
export const reorderExpenseCategoriesOutput = z.object({ ok: z.literal(true) })

export const mergeExpenseCategoriesInput = z.object({
  fromId: z.number().int().positive(),
  intoId: z.number().int().positive(),
})
export const mergeExpenseCategoriesOutput = z.object({
  moved: z.number().int(),
  item: expenseCategoryDto,
})

// ── Expenses ──────────────────────────────────────────────────────────

export const createExpenseInput = z.object({
  expenseDate: businessDate,
  categoryId: z.number().int().positive(),
  amount: z.number().int().positive(),
  paymentMethod: expensePaymentMethodSchema.default('cash'),
  vendorName: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  attachmentPath: z.string().optional().nullable(),
  employeeId: z.number().int().positive().optional().nullable(),
  vehicleId: z.number().int().positive().optional().nullable(),
  /** Defaults to 'manual'. Phase 6/7 pass 'payroll' / 'purchase'. */
  source: expenseSourceSchema.optional(),
  sourceRefTable: z.string().optional().nullable(),
  sourceRefId: z.number().int().positive().optional().nullable(),
  /** When recording from a recurring template, advances next_due_date. */
  recurringExpenseId: z.number().int().positive().optional().nullable(),
  forceClosedPeriod: z.boolean().optional(),
})
export type CreateExpenseInput = z.infer<typeof createExpenseInput>
export const createExpenseOutput = z.object({ item: expenseDto })

export const updateExpenseInput = z.object({
  id: z.number().int().positive(),
  expenseDate: businessDate.optional(),
  categoryId: z.number().int().positive().optional(),
  amount: z.number().int().positive().optional(),
  paymentMethod: expensePaymentMethodSchema.optional(),
  vendorName: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  attachmentPath: z.string().optional().nullable(),
  employeeId: z.number().int().positive().optional().nullable(),
  vehicleId: z.number().int().positive().optional().nullable(),
  clearAttachment: z.boolean().optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export type UpdateExpenseInput = z.infer<typeof updateExpenseInput>
export const updateExpenseOutput = z.object({ item: expenseDto })

export const voidExpenseInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1),
  forceClosedPeriod: z.boolean().optional(),
})
export const voidExpenseOutput = z.object({ item: expenseDto })

export const listExpensesInput = z.object({
  from: businessDate.optional(),
  to: businessDate.optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
  paymentMethod: expensePaymentMethodSchema.optional(),
  vendor: z.string().optional(),
  source: expenseSourceSchema.optional(),
  amountMin: z.number().int().nonnegative().optional(),
  amountMax: z.number().int().positive().optional(),
  search: z.string().optional(),
  employeeId: z.number().int().positive().optional(),
  vehicleId: z.number().int().positive().optional(),
  includeVoid: z.boolean().optional(),
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().min(0).optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'vendor']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})
export type ListExpensesInput = z.infer<typeof listExpensesInput>
export const listExpensesOutput = z.object({
  items: z.array(expenseDto),
  total: z.number().int(),
  totalAmount: z.number().int(),
  previousTotalAmount: z.number().int(),
})

export const getExpenseInput = z.object({ id: z.number().int().positive() })
export const getExpenseOutput = z.object({ item: expenseDto })

export const expenseSummaryInput = z.object({
  from: businessDate,
  to: businessDate,
})
export const summaryByCategoryOutput = z.object({
  items: z.array(categoryTotalDto),
  total: z.number().int(),
})
export const summaryByMonthOutput = z.object({
  items: z.array(monthTotalDto),
})
export const expenseInsightsOutput = z.object({
  byCategory: z.array(categoryTotalDto),
  byMonth: z.array(monthTotalDto),
  topVendors: z.array(vendorTotalDto),
  total: z.number().int(),
})

// ── Attachments ───────────────────────────────────────────────────────

export const attachExpenseReceiptInput = z.object({
  sourcePath: z.string().min(1),
  expenseDate: businessDate.optional(),
})
export const attachExpenseReceiptOutput = z.object({
  relativePath: z.string(),
  absolutePath: z.string(),
  warnedLarge: z.boolean(),
  downscaled: z.boolean(),
})

export const resolveExpenseAttachmentInput = z.object({
  relativePath: z.string().min(1),
})
export const resolveExpenseAttachmentOutput = z.object({
  absolutePath: z.string().nullable(),
  exists: z.boolean(),
})

export const openExpenseAttachmentInput = z.object({
  relativePath: z.string().min(1),
})
export const openExpenseAttachmentOutput = z.object({
  ok: z.literal(true),
})

export const expenseAttachmentPreviewInput = z.object({
  relativePath: z.string().min(1),
})
export const expenseAttachmentPreviewOutput = z.object({
  dataUrl: z.string().nullable(),
})

// ── Recurring ─────────────────────────────────────────────────────────

export const listRecurringExpensesInput = z.object({
  includeInactive: z.boolean().optional(),
})
export const listRecurringExpensesOutput = z.object({
  items: z.array(recurringExpenseDto),
})

export const createRecurringExpenseInput = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.number().int().positive(),
  amount: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  vendorName: z.string().trim().max(200).optional().nullable(),
  nextDueDate: businessDate,
})
export const createRecurringExpenseOutput = z.object({ item: recurringExpenseDto })

export const updateRecurringExpenseInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: z.number().int().positive().optional(),
  amount: z.number().int().positive().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  vendorName: z.string().trim().max(200).optional().nullable(),
  nextDueDate: businessDate.optional(),
  isActive: z.boolean().optional(),
})
export const updateRecurringExpenseOutput = z.object({ item: recurringExpenseDto })

export const dueRecurringExpensesInput = z.object({
  asOf: businessDate.optional(),
})
export const dueRecurringExpensesOutput = z.object({
  items: z.array(recurringExpenseDto),
})

// ── Attribution helpers ───────────────────────────────────────────────

export const expenseAttributionOptionsInput = z.object({})
export const expenseAttributionOptionsOutput = z.object({
  employees: z.array(z.object({ id: z.number().int(), name: z.string(), code: z.string() })),
  vehicles: z.array(z.object({ id: z.number().int(), name: z.string() })),
})

// ── Cash book (optional FR-EX-08) ─────────────────────────────────────

export const cashBookInput = z.object({
  date: businessDate,
  openingCash: z.number().int().nonnegative().optional(),
  countedCash: z.number().int().nonnegative().optional().nullable(),
})
export const cashBookOutput = z.object({
  date: businessDate,
  openingCash: z.number().int(),
  cashIn: z.number().int(),
  cashOut: z.number().int(),
  closingCash: z.number().int(),
  countedCash: z.number().int().nullable(),
  variance: z.number().int().nullable(),
  cashInCount: z.number().int(),
  cashOutCount: z.number().int(),
})
