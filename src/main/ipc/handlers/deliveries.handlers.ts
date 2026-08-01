import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  bottlesOutInput,
  bottlesOutOutput,
  copyPreviousDayInput,
  copyPreviousDayOutput,
  deliverySummaryInput,
  deliverySummaryOutput,
  exportMonthGridInput,
  exportMonthGridOutput,
  getCustomerCardInput,
  getCustomerCardOutput,
  getDayListInput,
  getDayListOutput,
  getDeliveryInput,
  getDeliveryOutput,
  getMonthGridInput,
  getMonthGridOutput,
  missedDeliveriesInput,
  missedDeliveriesOutput,
  recordBottleLossInput,
  recordBottleLossOutput,
  todaySummaryInput,
  todaySummaryOutput,
  upsertDeliveryInput,
  upsertDeliveryOutput,
  voidDeliveryInput,
  voidDeliveryOutput,
  walkInSaleInput,
  walkInSaleOutput,
} from '@shared/contracts'

export function registerDeliveryHandlers(): void {
  defineHandler({
    channel: 'deliveries:upsert',
    input: upsertDeliveryInput,
    output: upsertDeliveryOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().deliveries.upsertDelivery({ ...input, userId: ctx.userId }),
    }),
  })

  defineHandler({
    channel: 'deliveries:void',
    input: voidDeliveryInput,
    output: voidDeliveryOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().deliveries.voidDelivery(input.id, input.reason, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'deliveries:get',
    input: getDeliveryInput,
    output: getDeliveryOutput,
    roles: 'authenticated',
    handler: (input) => ({ item: getAppContext().deliveries.getById(input.id) }),
  })

  defineHandler({
    channel: 'deliveries:getDayList',
    input: getDayListInput,
    output: getDayListOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.getDayList(input),
  })

  defineHandler({
    channel: 'deliveries:getMonthGrid',
    input: getMonthGridInput,
    output: getMonthGridOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.getMonthGrid(input),
  })

  defineHandler({
    channel: 'deliveries:getCustomerCard',
    input: getCustomerCardInput,
    output: getCustomerCardOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.getCustomerCard(input),
  })

  defineHandler({
    channel: 'deliveries:summary',
    input: deliverySummaryInput,
    output: deliverySummaryOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.getDeliverySummary(input),
  })

  defineHandler({
    channel: 'deliveries:copyPreviousDay',
    input: copyPreviousDayInput,
    output: copyPreviousDayOutput,
    roles: ['owner', 'operator'],
    handler: (input) => getAppContext().deliveries.copyFromPreviousDay(input),
  })

  defineHandler({
    channel: 'deliveries:walkIn',
    input: walkInSaleInput,
    output: walkInSaleOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().deliveries.walkInSale({ ...input, userId: ctx.userId }),
    }),
  })

  defineHandler({
    channel: 'deliveries:bottlesOut',
    input: bottlesOutInput,
    output: bottlesOutOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.listBottlesOut(input),
  })

  defineHandler({
    channel: 'deliveries:missed',
    input: missedDeliveriesInput,
    output: missedDeliveriesOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.listMissedDeliveries(input),
  })

  defineHandler({
    channel: 'deliveries:recordLoss',
    input: recordBottleLossInput,
    output: recordBottleLossOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      getAppContext().deliveries.recordBottleLoss({ ...input, userId: ctx.userId }),
  })

  defineHandler({
    channel: 'deliveries:exportMonthGrid',
    input: exportMonthGridInput,
    output: exportMonthGridOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.exportMonthGrid(input),
  })

  defineHandler({
    channel: 'deliveries:todaySummary',
    input: todaySummaryInput,
    output: todaySummaryOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().deliveries.todaySummary(input.date),
  })
}
