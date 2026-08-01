import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const period = z.string().regex(/^\d{4}-\d{2}$/)

export const employeeRoleSchema = z.enum(['delivery', 'plant', 'admin', 'other'])
export type EmployeeRole = z.infer<typeof employeeRoleSchema>

export const salaryTypeSchema = z.enum([
  'monthly',
  'daily',
  'monthly_plus_commission',
  'commission_only',
])
export type SalaryType = z.infer<typeof salaryTypeSchema>

export const attendanceStatusSchema = z.enum([
  'present',
  'absent',
  'half_day',
  'paid_leave',
  'unpaid_leave',
  'holiday',
])
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>

export const workingDaysBasisSchema = z.enum(['calendar', 'fixed_26', 'working_days'])
export type WorkingDaysBasis = z.infer<typeof workingDaysBasisSchema>

export const expensePaymentMethodForPayroll = z.enum([
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'cheque',
  'credit',
  'other',
])

export const employeeSalaryDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  employeeId: z.number().int(),
  salaryType: salaryTypeSchema,
  baseAmount: z.number().int(),
  commissionPerBottle: z.number().int(),
  overtimeHourlyRate: z.number().int(),
  effectiveFrom: businessDate,
  effectiveTo: businessDate.nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
})
export type EmployeeSalaryDto = z.infer<typeof employeeSalaryDto>

export const employeeDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  cnic: z.string().nullable(),
  address: z.string().nullable(),
  photoPath: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  role: employeeRoleSchema,
  joiningDate: businessDate.nullable(),
  leavingDate: businessDate.nullable(),
  status: z.enum(['active', 'inactive']),
  notes: z.string().nullable(),
  currentSalary: employeeSalaryDto.nullable(),
  outstandingAdvances: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type EmployeeDto = z.infer<typeof employeeDto>

export const listEmployeesInput = z.object({
  search: z.string().optional(),
  role: employeeRoleSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
})
export type ListEmployeesInput = z.infer<typeof listEmployeesInput>
export const listEmployeesOutput = z.object({
  items: z.array(employeeDto),
  total: z.number().int(),
})

export const getEmployeeInput = z.object({ id: z.number().int().positive() })
export const getEmployeeOutput = z.object({
  item: employeeDto,
  salaryHistory: z.array(employeeSalaryDto),
})

export const nextEmployeeCodeOutput = z.object({ code: z.string() })

export const createEmployeeInput = z.object({
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(200),
  phone: z.string().max(40).nullable().optional(),
  cnic: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  photoPath: z.string().max(500).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(40).nullable().optional(),
  role: employeeRoleSchema.optional(),
  joiningDate: businessDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  salaryType: salaryTypeSchema.optional(),
  baseAmount: z.number().int().min(0).optional(),
  commissionPerBottle: z.number().int().min(0).optional(),
  overtimeHourlyRate: z.number().int().min(0).optional(),
  salaryEffectiveFrom: businessDate.optional(),
})
export type CreateEmployeeInput = z.infer<typeof createEmployeeInput>
export const createEmployeeOutput = z.object({ item: employeeDto })

export const updateEmployeeInput = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  cnic: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  photoPath: z.string().max(500).nullable().optional(),
  clearPhoto: z.boolean().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(40).nullable().optional(),
  role: employeeRoleSchema.optional(),
  joiningDate: businessDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInput>
export const updateEmployeeOutput = z.object({ item: employeeDto })

export const setEmployeeStatusInput = z.object({
  id: z.number().int().positive(),
  status: z.enum(['active', 'inactive']),
  leavingDate: businessDate.nullable().optional(),
})
export type SetEmployeeStatusInput = z.infer<typeof setEmployeeStatusInput>
export const setEmployeeStatusOutput = z.object({
  item: employeeDto,
  outstandingAdvances: z.number().int(),
  warning: z.string().nullable(),
})

export const changeSalaryInput = z.object({
  employeeId: z.number().int().positive(),
  salaryType: salaryTypeSchema,
  baseAmount: z.number().int().min(0),
  commissionPerBottle: z.number().int().min(0).default(0),
  overtimeHourlyRate: z.number().int().min(0).default(0),
  effectiveFrom: businessDate,
  reason: z.string().max(500).nullable().optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export type ChangeSalaryInput = z.infer<typeof changeSalaryInput>
export const changeSalaryOutput = z.object({
  item: employeeSalaryDto,
  warning: z.string().nullable(),
})

export const uploadEmployeePhotoInput = z.object({
  sourcePath: z.string().min(1),
  employeeId: z.number().int().positive().optional(),
})
export const uploadEmployeePhotoOutput = z.object({ photoPath: z.string() })

// ── Attendance ──────────────────────────────────────────────────────────

export const attendanceCellDto = z.object({
  date: businessDate,
  status: attendanceStatusSchema.nullable(),
  overtimeHours: z.number(),
  notes: z.string().nullable(),
  id: z.number().int().nullable(),
})
export type AttendanceCellDto = z.infer<typeof attendanceCellDto>

export const attendanceRowDto = z.object({
  employeeId: z.number().int(),
  code: z.string(),
  name: z.string(),
  role: employeeRoleSchema,
  cells: z.array(attendanceCellDto),
  present: z.number(),
  absent: z.number(),
  halfDays: z.number(),
  paidLeave: z.number(),
  unpaidLeave: z.number(),
  holidays: z.number(),
  overtimeHours: z.number(),
})
export type AttendanceRowDto = z.infer<typeof attendanceRowDto>

export const getAttendanceMonthInput = z.object({ period })
export const getAttendanceMonthOutput = z.object({
  period,
  daysInMonth: z.number().int(),
  periodClosed: z.boolean(),
  workingDaysBasis: workingDaysBasisSchema,
  rows: z.array(attendanceRowDto),
})
export type GetAttendanceMonthOutput = z.infer<typeof getAttendanceMonthOutput>

export const setAttendanceInput = z.object({
  employeeId: z.number().int().positive(),
  date: businessDate,
  status: attendanceStatusSchema,
  overtimeHours: z.number().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export type SetAttendanceInput = z.infer<typeof setAttendanceInput>
export const setAttendanceOutput = z.object({ cell: attendanceCellDto })

export const setAttendanceRangeInput = z.object({
  employeeId: z.number().int().positive(),
  from: businessDate,
  to: businessDate,
  status: attendanceStatusSchema,
  forceClosedPeriod: z.boolean().optional(),
})
export type SetAttendanceRangeInput = z.infer<typeof setAttendanceRangeInput>
export const setAttendanceRangeOutput = z.object({ updated: z.number().int() })

export const markAllPresentInput = z.object({
  date: businessDate.optional(),
  period: period.optional(),
  forceClosedPeriod: z.boolean().optional(),
})
export type MarkAllPresentInput = z.infer<typeof markAllPresentInput>
export const markAllPresentOutput = z.object({ updated: z.number().int() })

export const markHolidayInput = z.object({
  date: businessDate,
  forceClosedPeriod: z.boolean().optional(),
})
export type MarkHolidayInput = z.infer<typeof markHolidayInput>
export const markHolidayOutput = z.object({ updated: z.number().int() })

export const todayAttendanceInput = z.object({ date: businessDate.optional() })
export const todayAttendanceOutput = z.object({
  date: businessDate,
  periodClosed: z.boolean(),
  items: z.array(
    z.object({
      employeeId: z.number().int(),
      code: z.string(),
      name: z.string(),
      status: attendanceStatusSchema.nullable(),
      overtimeHours: z.number(),
    }),
  ),
})
export type TodayAttendanceOutput = z.infer<typeof todayAttendanceOutput>

// ── Advances ────────────────────────────────────────────────────────────

export const salaryAdvanceDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  employeeId: z.number().int(),
  employeeCode: z.string().optional(),
  employeeName: z.string().optional(),
  advanceDate: businessDate,
  amount: z.number().int(),
  reason: z.string().nullable(),
  status: z.enum(['outstanding', 'settled', 'waived', 'void']),
  settledInPayrollItemId: z.number().int().nullable(),
  expenseId: z.number().int().nullable(),
  createdAt: z.string(),
})
export type SalaryAdvanceDto = z.infer<typeof salaryAdvanceDto>

export const listAdvancesInput = z.object({
  employeeId: z.number().int().positive().optional(),
  status: z.enum(['outstanding', 'settled', 'waived', 'void', 'all']).optional(),
})
export type ListAdvancesInput = z.infer<typeof listAdvancesInput>
export const listAdvancesOutput = z.object({
  items: z.array(salaryAdvanceDto),
  outstandingTotal: z.number().int(),
})

export const createAdvanceInput = z.object({
  employeeId: z.number().int().positive(),
  advanceDate: businessDate,
  amount: z.number().int().positive(),
  reason: z.string().max(500).nullable().optional(),
  paymentMethod: expensePaymentMethodForPayroll.default('cash'),
  forceClosedPeriod: z.boolean().optional(),
})
export type CreateAdvanceInput = z.infer<typeof createAdvanceInput>
export const createAdvanceOutput = z.object({ item: salaryAdvanceDto })

export const voidAdvanceInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  forceClosedPeriod: z.boolean().optional(),
})
export const voidAdvanceOutput = z.object({ item: salaryAdvanceDto })

export const waiveAdvanceInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1).max(500),
})
export const waiveAdvanceOutput = z.object({ item: salaryAdvanceDto })

// ── Payroll ─────────────────────────────────────────────────────────────

export const payrollItemDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  payrollRunId: z.number().int(),
  employeeId: z.number().int(),
  employeeCode: z.string(),
  employeeName: z.string(),
  employeeRole: employeeRoleSchema,
  salaryType: salaryTypeSchema,
  baseAmount: z.number().int(),
  workingDays: z.number().int(),
  daysPresent: z.number(),
  daysAbsent: z.number(),
  absenceDeduction: z.number().int(),
  bottlesDelivered: z.number().int(),
  commissionAmount: z.number().int(),
  overtimeHours: z.number(),
  overtimeAmount: z.number().int(),
  bonusAmount: z.number().int(),
  advancesDeducted: z.number().int(),
  advancesOutstanding: z.number().int(),
  advancesCarryForward: z.number().int(),
  otherDeductions: z.number().int(),
  deductionNotes: z.string().nullable(),
  netPayable: z.number().int(),
  paidAmount: z.number().int(),
  paymentDate: businessDate.nullable(),
  paymentMethod: z.string().nullable(),
  expenseId: z.number().int().nullable(),
  notes: z.string().nullable(),
  warning: z.string().nullable(),
  grossPay: z.number().int(),
})
export type PayrollItemDto = z.infer<typeof payrollItemDto>

export const payrollRunDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  period,
  generatedOn: businessDate,
  status: z.enum(['draft', 'finalized', 'void']),
  totalNet: z.number().int(),
  notes: z.string().nullable(),
  workingDaysBasis: workingDaysBasisSchema,
  itemCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PayrollRunDto = z.infer<typeof payrollRunDto>

export const listPayrollRunsOutput = z.object({ items: z.array(payrollRunDto) })

export const generatePayrollInput = z.object({
  period,
  forceClosedPeriod: z.boolean().optional(),
})
export const generatePayrollOutput = z.object({
  run: payrollRunDto,
  items: z.array(payrollItemDto),
})

export const getPayrollRunInput = z.object({ id: z.number().int().positive() })
export const getPayrollRunOutput = z.object({
  run: payrollRunDto,
  items: z.array(payrollItemDto),
})

export const updatePayrollItemInput = z.object({
  id: z.number().int().positive(),
  bonusAmount: z.number().int().min(0).optional(),
  otherDeductions: z.number().int().min(0).optional(),
  deductionNotes: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})
export type UpdatePayrollItemInput = z.infer<typeof updatePayrollItemInput>
export const updatePayrollItemOutput = z.object({ item: payrollItemDto })

export const finalizePayrollInput = z.object({
  id: z.number().int().positive(),
  paymentDate: businessDate.optional(),
  paymentMethod: expensePaymentMethodForPayroll.default('cash'),
  forceClosedPeriod: z.boolean().optional(),
})
export type FinalizePayrollInput = z.infer<typeof finalizePayrollInput>
export const finalizePayrollOutput = z.object({
  run: payrollRunDto,
  items: z.array(payrollItemDto),
  salariesExpenseTotal: z.number().int(),
})

export const voidPayrollInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  forceClosedPeriod: z.boolean().optional(),
})
export const voidPayrollOutput = z.object({ run: payrollRunDto })

export const recordPayrollPaymentInput = z.object({
  itemId: z.number().int().positive(),
  amount: z.number().int().positive(),
  paymentDate: businessDate,
  paymentMethod: expensePaymentMethodForPayroll,
})
export type RecordPayrollPaymentInput = z.infer<typeof recordPayrollPaymentInput>
export const recordPayrollPaymentOutput = z.object({ item: payrollItemDto })

export const payAllPayrollInput = z.object({
  runId: z.number().int().positive(),
  paymentDate: businessDate,
  paymentMethod: expensePaymentMethodForPayroll.default('cash'),
})
export type PayAllPayrollInput = z.infer<typeof payAllPayrollInput>
export const payAllPayrollOutput = z.object({ items: z.array(payrollItemDto) })

export const employeePerformanceInput = z.object({
  employeeId: z.number().int().positive(),
  period: period.optional(),
})
export const employeePerformanceMonthDto = z.object({
  period,
  bottlesDelivered: z.number().int(),
  uniqueCustomers: z.number().int(),
  deliveriesCount: z.number().int(),
  cashCollected: z.number().int(),
  cashVariance: z.number().int().nullable(),
  attendancePercent: z.number(),
  daysPresent: z.number(),
  workingDays: z.number().int(),
})
export type EmployeePerformanceMonthDto = z.infer<typeof employeePerformanceMonthDto>

export const employeePerformanceOutput = z.object({
  employeeId: z.number().int(),
  current: employeePerformanceMonthDto,
  trend: z.array(employeePerformanceMonthDto),
})
export type EmployeePerformanceOutput = z.infer<typeof employeePerformanceOutput>

export const comparePerformanceInput = z.object({ period })
export const comparePerformanceOutput = z.object({
  period,
  items: z.array(
    z.object({
      employeeId: z.number().int(),
      code: z.string(),
      name: z.string(),
      bottlesDelivered: z.number().int(),
      uniqueCustomers: z.number().int(),
      deliveriesCount: z.number().int(),
      cashCollected: z.number().int(),
      attendancePercent: z.number(),
    }),
  ),
})
export type ComparePerformanceOutput = z.infer<typeof comparePerformanceOutput>

export const listActiveEmployeesOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      code: z.string(),
      name: z.string(),
      role: employeeRoleSchema,
    }),
  ),
})
