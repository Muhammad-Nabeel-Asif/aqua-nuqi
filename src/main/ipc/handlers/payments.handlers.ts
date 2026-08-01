import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  collectedCashPreviewInput,
  collectedCashPreviewOutput,
  getPaymentInput,
  getPaymentOutput,
  listPaymentsInput,
  listPaymentsOutput,
  postCollectedCashInput,
  postCollectedCashOutput,
  reallocatePaymentInput,
  reallocatePaymentOutput,
  receivablesReportInput,
  receivablesReportOutput,
  recordPaymentInput,
  recordPaymentOutput,
  voidPaymentInput,
  voidPaymentOutput,
} from '@shared/contracts'

export function registerPaymentHandlers(): void {
  defineHandler({
    channel: 'payments:record',
    input: recordPaymentInput,
    output: recordPaymentOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().payments.recordPayment(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'payments:void',
    input: voidPaymentInput,
    output: voidPaymentOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: getAppContext().payments.voidPayment(input.id, input.reason, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'payments:reallocate',
    input: reallocatePaymentInput,
    output: reallocatePaymentOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().payments.reallocate(input.id, input.allocations, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'payments:list',
    input: listPaymentsInput,
    output: listPaymentsOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().payments.list(input),
  })

  defineHandler({
    channel: 'payments:get',
    input: getPaymentInput,
    output: getPaymentOutput,
    roles: 'authenticated',
    handler: (input) => ({ item: getAppContext().payments.getById(input.id) }),
  })

  defineHandler({
    channel: 'payments:postCollectedCash',
    input: postCollectedCashInput,
    output: postCollectedCashOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => getAppContext().payments.postCollectedCash(input.date, ctx.userId!),
  })

  defineHandler({
    channel: 'payments:collectedCashPreview',
    input: collectedCashPreviewInput,
    output: collectedCashPreviewOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().payments.collectedCashPreview(input.date),
  })

  defineHandler({
    channel: 'receivables:report',
    input: receivablesReportInput,
    output: receivablesReportOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().receivables.report(input.asOf),
  })
}
