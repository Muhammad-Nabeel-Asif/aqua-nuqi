import { z } from 'zod'
import { categoryTotalDto, monthTotalDto, vendorTotalDto } from './expenses'
import {
  employeeVarianceSummaryOutput,
  inventoryBottlesOutOutput,
  listStockMovementsOutput,
} from './inventory'
import { receivableRowDto } from './payments'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const period = z.string().regex(/^\d{4}-\d{2}$/)

export const reportBasisSchema = z.enum(['accrual', 'cash'])
export type ReportBasis = z.infer<typeof reportBasisSchema>

export const reportRangeKindSchema = z.enum(['month', 'quarter', 'year', 'custom'])

export const reportRangeInput = z.object({
  kind: reportRangeKindSchema,
  period: period.optional(),
  year: z.number().int().optional(),
  from: businessDate.optional(),
  to: businessDate.optional(),
})
export type ReportRangeInput = z.infer<typeof reportRangeInput>

export const resolveReportRangeOutput = z.object({
  from: businessDate,
  to: businessDate,
  label: z.string(),
})
export type ResolveReportRangeOutput = z.infer<typeof resolveReportRangeOutput>

export const dateRangeInput = z.object({
  from: businessDate,
  to: businessDate,
})

export const profitLossInput = dateRangeInput.extend({
  basis: reportBasisSchema,
  compare: z.boolean().optional(),
})
export type ProfitLossInput = z.infer<typeof profitLossInput>

const plCompareSchema = z
  .object({
    from: businessDate,
    to: businessDate,
    netRevenue: z.number().int(),
    totalExpenses: z.number().int(),
    netProfit: z.number().int(),
  })
  .nullable()

export const profitLossOutput = z.object({
  from: businessDate,
  to: businessDate,
  basis: reportBasisSchema,
  basisExplanation: z.string(),
  revenue: z.object({
    waterSales: z.number().int(),
    otherCharges: z.number().int(),
    discountsAndWriteOffs: z.number().int(),
    netRevenue: z.number().int(),
    walkInSales: z.number().int(),
  }),
  excluded: z.object({
    depositsReceived: z.number().int(),
    depositsRefunded: z.number().int(),
    depositPaymentsTagged: z.number().int(),
    customerCreditBalances: z.number().int(),
  }),
  expenses: z.array(
    z.object({
      categoryId: z.number().int(),
      categoryName: z.string(),
      total: z.number().int(),
      count: z.number().int(),
      isSalaries: z.boolean(),
      isEmployeeAdvance: z.boolean(),
    }),
  ),
  totalExpenses: z.number().int(),
  netProfit: z.number().int(),
  marginPercent: z.number().nullable(),
  previousPeriod: plCompareSchema,
  samePeriodLastYear: plCompareSchema,
})
export type ProfitLossOutput = z.infer<typeof profitLossOutput>

export const expenseDrilldownInput = dateRangeInput.extend({
  categoryId: z.number().int(),
})
export const expenseDrilldownOutput = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      expenseDate: businessDate,
      amount: z.number().int(),
      description: z.string().nullable(),
      vendorName: z.string().nullable(),
      source: z.string(),
    }),
  ),
})

export const salesSummaryInput = dateRangeInput.extend({
  groupBy: z.enum(['day', 'month']),
  areaId: z.number().int().optional(),
  routeId: z.number().int().optional(),
  employeeId: z.number().int().optional(),
  customerType: z.string().optional(),
})
export const salesSummaryOutput = z.object({
  from: businessDate,
  to: businessDate,
  groupBy: z.enum(['day', 'month']),
  items: z.array(
    z.object({
      bucket: z.string(),
      units: z.number().int(),
      value: z.number().int(),
      customers: z.number().int(),
    }),
  ),
  totals: z.object({ units: z.number().int(), value: z.number().int() }),
})

export const customerWiseSalesInput = dateRangeInput.extend({
  topN: z.number().int().positive().optional(),
  areaId: z.number().int().optional(),
  routeId: z.number().int().optional(),
})
export const customerWiseSalesOutput = z.object({
  from: businessDate,
  to: businessDate,
  items: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      units: z.number().int(),
      revenue: z.number().int(),
      deliveryDays: z.number().int(),
      averagePerDelivery: z.number().int(),
    }),
  ),
  totals: z.object({ units: z.number().int(), revenue: z.number().int() }),
})

export const areaRoutePerformanceInput = dateRangeInput.extend({
  groupBy: z.enum(['area', 'route']),
})
export const areaRoutePerformanceOutput = z.object({
  from: businessDate,
  to: businessDate,
  groupBy: z.enum(['area', 'route']),
  items: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      units: z.number().int(),
      revenue: z.number().int(),
      activeCustomers: z.number().int(),
      averageRevenuePerCustomer: z.number().int(),
    }),
  ),
})

export const employeeDeliveryReportInput = dateRangeInput
export const employeeDeliveryReportOutput = z.object({
  from: businessDate,
  to: businessDate,
  items: z.array(
    z.object({
      employeeId: z.number().int(),
      employeeName: z.string(),
      units: z.number().int(),
      customersServed: z.number().int(),
      cashCollected: z.number().int(),
      cashVariance: z.number().int(),
      bottleVariance: z.number().int(),
    }),
  ),
})

export const customerActivityInput = dateRangeInput
export const customerActivityOutput = z.object({
  from: businessDate,
  to: businessDate,
  newCustomers: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      joinedOn: businessDate.nullable(),
    }),
  ),
  stopped: z.array(z.object({ customerId: z.number().int(), code: z.string(), name: z.string() })),
  paused: z.array(z.object({ customerId: z.number().int(), code: z.string(), name: z.string() })),
  churnCount: z.number().int(),
})

export const customerConsumptionTrendInput = z.object({
  customerId: z.number().int(),
  months: z.number().int().min(1).max(24).optional(),
})
export const customerConsumptionTrendOutput = z.object({
  customerId: z.number().int(),
  items: z.array(
    z.object({
      period: period,
      units: z.number().int(),
      revenue: z.number().int(),
    }),
  ),
})

export const receivablesAgeingInput = z.object({
  asOf: businessDate.optional(),
})
export const receivablesAgeingOutput = z.object({
  asOf: businessDate,
  outstanding: z.array(receivableRowDto),
  inCredit: z.array(receivableRowDto),
  bucketTotals: z.object({
    current: z.number().int(),
    '1-30': z.number().int(),
    '31-60': z.number().int(),
    '60+': z.number().int(),
  }),
  totalOutstanding: z.number().int(),
  totalCredit: z.number().int(),
  byArea: z.array(
    z.object({
      areaName: z.string(),
      total: z.number().int(),
      count: z.number().int(),
      buckets: z.object({
        current: z.number().int(),
        '1-30': z.number().int(),
        '31-60': z.number().int(),
        '60+': z.number().int(),
      }),
    }),
  ),
})

export const collectionReportInput = dateRangeInput
export const collectionReportOutput = z.object({
  from: businessDate,
  to: businessDate,
  total: z.number().int(),
  paymentsTotal: z.number().int(),
  walkInCash: z.number().int(),
  byMethod: z.array(z.object({ method: z.string(), total: z.number().int() })),
  byDay: z.array(z.object({ date: businessDate, total: z.number().int() })),
  byEmployee: z.array(
    z.object({
      employeeId: z.number().int(),
      name: z.string(),
      total: z.number().int(),
    }),
  ),
  count: z.number().int(),
})

export const expenseReportInput = dateRangeInput
export const expenseReportOutput = z.object({
  from: businessDate,
  to: businessDate,
  byCategory: z.array(categoryTotalDto),
  total: z.number().int(),
  byMonth: z.array(monthTotalDto),
  topVendors: z.array(vendorTotalDto),
})

export const costPerBottleInput = dateRangeInput
export const costPerBottleOutput = z.object({
  from: businessDate,
  to: businessDate,
  items: z.array(
    z.object({
      period: period,
      expenses: z.number().int(),
      bottles: z.number().int(),
      costPerBottle: z.number().int().nullable(),
      averageRevenuePerBottle: z.number().int().nullable(),
      marginPerBottle: z.number().int().nullable(),
    }),
  ),
})

export const bottlesOutReportInput = z.object({
  search: z.string().optional(),
  routeId: z.number().int().optional(),
  areaId: z.number().int().optional(),
  minBottles: z.number().int().optional(),
  shortfallOnly: z.boolean().optional(),
  noReturnDays: z.number().int().optional(),
})
export const bottlesOutReportOutput = inventoryBottlesOutOutput

export const bottleLossReportInput = dateRangeInput
export const bottleLossReportOutput = z.object({
  from: businessDate,
  to: businessDate,
  scrapped: z.number().int(),
  lostAtCustomers: z.number().int(),
  byReason: z.array(
    z.object({
      reason: z.string(),
      bottleState: z.string(),
      quantity: z.number().int(),
    }),
  ),
  customerLoss: z.array(z.object({ kind: z.string(), quantity: z.number().int() })),
  totalOwnedStart: z.number().int(),
  totalOwnedEnd: z.number().int(),
  netChangeOwned: z.number().int(),
})

export const tripVarianceReportInput = dateRangeInput
export const tripVarianceReportOutput = z.object({
  from: businessDate,
  to: businessDate,
  trips: z.array(
    z.object({
      tripId: z.number().int(),
      tripDate: businessDate,
      employeeId: z.number().int().nullable(),
      employeeName: z.string().nullable().optional(),
      cashVariance: z.number().int(),
      bottleVariance: z.number().int(),
    }),
  ),
  byEmployee: employeeVarianceSummaryOutput.shape.items,
  byMonth: z.array(
    z.object({
      period: period,
      cashVariance: z.number().int(),
      bottleVariance: z.number().int(),
      trips: z.number().int(),
    }),
  ),
  totals: z.object({
    cashVariance: z.number().int(),
    bottleVariance: z.number().int(),
    trips: z.number().int(),
  }),
})

export const stockMovementRegisterInput = dateRangeInput.extend({
  productId: z.number().int().optional(),
  reason: z.string().optional(),
})
export const stockMovementRegisterOutput = listStockMovementsOutput

export const dashboardInput = z.object({
  asOf: businessDate.optional(),
})

export const dashboardOutput = z.object({
  asOf: businessDate,
  today: z.object({
    bottlesDelivered: z.number().int(),
    customersServed: z.number().int(),
    cashCollected: z.number().int(),
    missedScheduled: z.number().int(),
  }),
  month: z.object({
    period: period,
    bottlesDelivered: z.number().int(),
    revenueAccrual: z.number().int(),
    revenueCash: z.number().int(),
    expenses: z.number().int(),
    profitAccrual: z.number().int(),
    profitCash: z.number().int(),
    pctChangeBottles: z.number().nullable(),
    pctChangeRevenueAccrual: z.number().nullable(),
    pctChangeExpenses: z.number().nullable(),
    pctChangeProfitAccrual: z.number().nullable(),
  }),
  assets: z.object({
    totalOutstanding: z.number().int(),
    ageingBuckets: z.record(z.string(), z.number()),
    customersInCredit: z.number().int(),
    totalCredit: z.number().int(),
    bottlesWithCustomers: z.number().int(),
    filledStockAtPlant: z.number().int(),
  }),
  charts: z.object({
    last12Months: z.array(
      z.object({
        period: period,
        revenueAccrual: z.number().int(),
        revenueCash: z.number().int(),
        expenses: z.number().int(),
        profitAccrual: z.number().int(),
        profitCash: z.number().int(),
      }),
    ),
    dailyBottlesThisMonth: z.array(z.object({ date: businessDate, bottles: z.number().int() })),
  }),
  actions: z.object({
    topOverdue: z.array(
      z.object({
        customerId: z.number().int(),
        code: z.string(),
        name: z.string(),
        balance: z.number().int(),
        daysOverdue: z.number().int(),
      }),
    ),
    noDeliveryDays: z.array(
      z.object({
        customerId: z.number().int(),
        code: z.string(),
        name: z.string(),
        daysSince: z.number().int().nullable(),
        lastDeliveryDate: businessDate.nullable(),
      }),
    ),
    recurringNotRecorded: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        amount: z.number().int(),
        vendorName: z.string().nullable(),
      }),
    ),
    tripVariancesThisWeek: z.array(
      z.object({
        tripId: z.number().int(),
        tripDate: businessDate,
        employeeName: z.string().nullable(),
        cashVariance: z.number().int(),
        bottleVariance: z.number().int(),
      }),
    ),
    backupStale: z.boolean(),
    backupLastSuccessAt: z.string().nullable(),
  }),
})
export type DashboardOutput = z.infer<typeof dashboardOutput>
