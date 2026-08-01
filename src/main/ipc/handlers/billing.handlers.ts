import { z } from 'zod'
import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  createAdjustmentInput,
  createAdjustmentOutput,
  generateBatchInput,
  generateBatchOutput,
  generateInvoiceInput,
  generateInvoiceOutput,
  getInvoiceInput,
  getInvoiceOutput,
  getLedgerInput,
  getLedgerOutput,
  issueAllInput,
  issueAllOutput,
  issueInvoiceInput,
  issueInvoiceOutput,
  listAdjustmentsInput,
  listAdjustmentsOutput,
  listInvoicesInput,
  listInvoicesOutput,
  listPeriodsOverviewOutput,
  markSharedInput,
  markSharedOutput,
  previewBatchInput,
  previewBatchOutput,
  previewInvoiceInput,
  previewInvoiceOutput,
  voidAdjustmentInput,
  voidAdjustmentOutput,
  voidInvoiceInput,
  voidInvoiceOutput,
} from '@shared/contracts'

export function registerBillingHandlers(): void {
  defineHandler({
    channel: 'invoices:preview',
    input: previewInvoiceInput,
    output: previewInvoiceOutput,
    roles: 'authenticated',
    handler: (input) => ({
      preview: getAppContext().billing.previewInvoice(input.customerId, input.period),
    }),
  })

  defineHandler({
    channel: 'invoices:previewBatch',
    input: previewBatchInput,
    output: previewBatchOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().billing.previewBatch(input.period, input.filter, {
        includeZeroActivity: input.includeZeroActivity,
      }),
    }),
  })

  defineHandler({
    channel: 'invoices:generate',
    input: generateInvoiceInput,
    output: generateInvoiceOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().billing.generateInvoice(
        input.customerId,
        input.period,
        { issueDate: input.issueDate, notes: input.notes },
        ctx.userId,
      ),
    }),
  })

  defineHandler({
    channel: 'invoices:generateBatch',
    input: generateBatchInput,
    output: generateBatchOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      getAppContext().billing.generateBatch(
        input.period,
        input.filter,
        {
          issueDate: input.issueDate,
          includeZeroActivity: input.includeZeroActivity,
          customerIds: input.customerIds,
        },
        ctx.userId,
      ),
  })

  defineHandler({
    channel: 'invoices:issue',
    input: issueInvoiceInput,
    output: issueInvoiceOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().billing.issueInvoice(input.id, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'invoices:issueAll',
    input: issueAllInput,
    output: issueAllOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => getAppContext().billing.issueAll(input.invoiceIds, ctx.userId),
  })

  defineHandler({
    channel: 'invoices:void',
    input: voidInvoiceInput,
    output: voidInvoiceOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: getAppContext().billing.voidInvoice(input.id, input.reason, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'invoices:list',
    input: listInvoicesInput,
    output: listInvoicesOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().billing.listInvoices(input),
  })

  defineHandler({
    channel: 'invoices:get',
    input: getInvoiceInput,
    output: getInvoiceOutput,
    roles: 'authenticated',
    handler: (input) => ({ item: getAppContext().billing.getById(input.id) }),
  })

  defineHandler({
    channel: 'invoices:markShared',
    input: markSharedInput,
    output: markSharedOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      count: getAppContext().billing.markShared(input.invoiceIds, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'billing:periodsOverview',
    input: z.object({}),
    output: listPeriodsOverviewOutput,
    roles: 'authenticated',
    handler: () => ({ items: getAppContext().billing.listPeriodsOverview() }),
  })

  defineHandler({
    channel: 'adjustments:create',
    input: createAdjustmentInput,
    output: createAdjustmentOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().adjustments.create(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'adjustments:void',
    input: voidAdjustmentInput,
    output: voidAdjustmentOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: getAppContext().adjustments.void(input.id, input.reason, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'adjustments:list',
    input: listAdjustmentsInput,
    output: listAdjustmentsOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().adjustments.listForCustomer(input.customerId, {
        unbilledOnly: input.unbilledOnly,
      }),
    }),
  })

  defineHandler({
    channel: 'ledger:get',
    input: getLedgerInput,
    output: getLedgerOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().ledger.getLedger(input.customerId, {
        from: input.from,
        to: input.to,
      }),
    }),
  })
}
