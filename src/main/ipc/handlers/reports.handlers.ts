import { z } from 'zod'
import { getAppContext } from '@main/app-context'
import { resolveReportRange } from '@main/services/report.service'
import {
  areaRoutePerformanceInput,
  areaRoutePerformanceOutput,
  bottleLossReportInput,
  bottleLossReportOutput,
  bottlesOutReportInput,
  collectionReportInput,
  collectionReportOutput,
  costPerBottleInput,
  costPerBottleOutput,
  customerActivityInput,
  customerActivityOutput,
  customerConsumptionTrendInput,
  customerConsumptionTrendOutput,
  customerWiseSalesInput,
  customerWiseSalesOutput,
  dashboardInput,
  dashboardOutput,
  employeeDeliveryReportInput,
  employeeDeliveryReportOutput,
  expenseDrilldownInput,
  expenseDrilldownOutput,
  expenseReportInput,
  expenseReportOutput,
  profitLossInput,
  profitLossOutput,
  receivablesAgeingInput,
  receivablesAgeingOutput,
  salesSummaryInput,
  salesSummaryOutput,
  stockMovementRegisterInput,
  tripVarianceReportInput,
  tripVarianceReportOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerReportHandlers(): void {
  const reports = () => getAppContext().reports

  defineHandler({
    channel: 'reports:dashboard',
    input: dashboardInput,
    output: dashboardOutput,
    roles: 'authenticated',
    handler: (input, ctx) => {
      const role = ctx.role ?? 'viewer'
      return reports().dashboardForRole(role, input.asOf)
    },
  })

  defineHandler({
    channel: 'reports:profitAndLoss',
    input: profitLossInput,
    output: profitLossOutput,
    roles: ['owner'],
    handler: (input) =>
      reports().profitAndLoss({ from: input.from, to: input.to }, input.basis, {
        compare: input.compare,
      }),
  })

  defineHandler({
    channel: 'reports:expenseDrilldown',
    input: expenseDrilldownInput,
    output: expenseDrilldownOutput,
    roles: ['owner'],
    handler: (input) =>
      reports().expenseDrilldown({ from: input.from, to: input.to }, input.categoryId),
  })

  defineHandler({
    channel: 'reports:salesSummary',
    input: salesSummaryInput,
    output: salesSummaryOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().salesSummary(input),
  })

  defineHandler({
    channel: 'reports:customerWiseSales',
    input: customerWiseSalesInput,
    output: customerWiseSalesOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().customerWiseSales(input),
  })

  defineHandler({
    channel: 'reports:areaRoutePerformance',
    input: areaRoutePerformanceInput,
    output: areaRoutePerformanceOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().areaRoutePerformance(input),
  })

  defineHandler({
    channel: 'reports:employeeDelivery',
    input: employeeDeliveryReportInput,
    output: employeeDeliveryReportOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().employeeDeliveryReport(input),
  })

  defineHandler({
    channel: 'reports:customerActivity',
    input: customerActivityInput,
    output: customerActivityOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().customerActivity(input),
  })

  defineHandler({
    channel: 'reports:customerConsumptionTrend',
    input: customerConsumptionTrendInput,
    output: customerConsumptionTrendOutput,
    roles: 'authenticated',
    handler: (input) => reports().customerConsumptionTrend(input.customerId, input.months),
  })

  defineHandler({
    channel: 'reports:receivablesAgeing',
    input: receivablesAgeingInput,
    output: receivablesAgeingOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().receivablesAgeing(input.asOf),
  })

  defineHandler({
    channel: 'reports:collection',
    input: collectionReportInput,
    output: collectionReportOutput,
    roles: ['owner'],
    handler: (input) => reports().collectionReport(input),
  })

  defineHandler({
    channel: 'reports:expenses',
    input: expenseReportInput,
    output: expenseReportOutput,
    roles: ['owner'],
    handler: (input) => reports().expenseReport(input),
  })

  defineHandler({
    channel: 'reports:costPerBottle',
    input: costPerBottleInput,
    output: costPerBottleOutput,
    roles: ['owner'],
    handler: (input) => reports().costPerBottle(input),
  })

  defineHandler({
    channel: 'reports:bottlesOut',
    input: bottlesOutReportInput,
    output: z.any(),
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().bottlesOutReport(input),
  })

  defineHandler({
    channel: 'reports:bottleLoss',
    input: bottleLossReportInput,
    output: bottleLossReportOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().bottleLossReport(input),
  })

  defineHandler({
    channel: 'reports:tripVariance',
    input: tripVarianceReportInput,
    output: tripVarianceReportOutput,
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().tripVarianceReport(input),
  })

  defineHandler({
    channel: 'reports:stockMovements',
    input: stockMovementRegisterInput,
    output: z.any(),
    roles: ['owner', 'operator', 'viewer'],
    handler: (input) => reports().stockMovementRegister(input),
  })

  defineHandler({
    channel: 'reports:resolveRange',
    input: z.object({
      kind: z.enum(['month', 'quarter', 'year', 'custom']),
      period: z.string().optional(),
      year: z.number().int().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    output: z.object({
      from: z.string(),
      to: z.string(),
      label: z.string(),
    }),
    roles: 'authenticated',
    handler: (input) => resolveReportRange(input),
  })
}
