import { z } from 'zod'
import { getAppContext } from '@main/app-context'
import { seedDemoCustomers } from '@main/db/seed-demo'
import { defineHandler } from '@main/ipc/router'
import {
  bulkChangeRateInput,
  bulkChangeRateOutput,
  bulkUpdateCustomersInput,
  bulkUpdateCustomersOutput,
  changeRateInput,
  changeRateOutput,
  commitImportInput,
  commitImportOutput,
  createCustomerInput,
  createCustomerOutput,
  customerAuditInput,
  customerAuditOutput,
  exportCustomersInput,
  exportCustomersOutput,
  getCustomerInput,
  getCustomerOutput,
  getRateForInput,
  getRateForOutput,
  listCustomersInput,
  listCustomersOutput,
  nextCustomerCodeInput,
  nextCustomerCodeOutput,
  parseImportFileInput,
  parseImportFileOutput,
  previewBulkRateInput,
  previewBulkRateOutput,
  recalculateBalancesInput,
  recalculateBalancesOutput,
  searchCustomersInput,
  searchCustomersOutput,
  setCustomerStatusInput,
  setCustomerStatusOutput,
  updateCustomerInput,
  updateCustomerOutput,
  validateImportInput,
  validateImportOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'

const importTemplateOutput = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
})

const seedDemoOutput = z.object({
  areas: z.number().int(),
  routes: z.number().int(),
  customers: z.number().int(),
})

export function registerCustomerHandlers(): void {
  defineHandler({
    channel: 'customers:list',
    input: listCustomersInput,
    output: listCustomersOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().customers.list(input),
  })

  defineHandler({
    channel: 'customers:get',
    input: getCustomerInput,
    output: getCustomerOutput,
    roles: 'authenticated',
    handler: (input) => getAppContext().customers.getWithHistory(input.id),
  })

  defineHandler({
    channel: 'customers:nextCode',
    input: nextCustomerCodeInput,
    output: nextCustomerCodeOutput,
    roles: ['owner', 'operator'],
    handler: () => ({ code: getAppContext().customers.peekNextCode() }),
  })

  defineHandler({
    channel: 'customers:create',
    input: createCustomerInput,
    output: createCustomerOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().customers.create(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'customers:update',
    input: updateCustomerInput,
    output: updateCustomerOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().customers.update(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'customers:setStatus',
    input: setCustomerStatusInput,
    output: setCustomerStatusOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().customers.setStatus(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'customers:bulkUpdate',
    input: bulkUpdateCustomersInput,
    output: bulkUpdateCustomersOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => getAppContext().customers.bulkUpdate(input, ctx.userId),
  })

  defineHandler({
    channel: 'customers:search',
    input: searchCustomersInput,
    output: searchCustomersOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().customers.search(input.query, input.limit),
    }),
  })

  defineHandler({
    channel: 'customers:audit',
    input: customerAuditInput,
    output: customerAuditOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().customers.listAudit(input.customerId, input.limit),
    }),
  })

  defineHandler({
    channel: 'customers:export',
    input: exportCustomersInput,
    output: exportCustomersOutput,
    roles: ['owner', 'operator'],
    handler: (input) => getAppContext().customers.exportRows(input.format ?? 'csv'),
  })

  defineHandler({
    channel: 'rates:getFor',
    input: getRateForInput,
    output: getRateForOutput,
    roles: 'authenticated',
    handler: (input) => ({
      rate: getAppContext().rates.getRateFor(input.customerId, input.productId, input.onDate),
    }),
  })

  defineHandler({
    channel: 'rates:change',
    input: changeRateInput,
    output: changeRateOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => {
      const result = getAppContext().rates.changeRate({ ...input, userId: ctx.userId })
      return result
    },
  })

  defineHandler({
    channel: 'rates:bulkChange',
    input: bulkChangeRateInput,
    output: bulkChangeRateOutput,
    roles: ['owner'],
    handler: (input, ctx) => getAppContext().rates.bulkChangeRate({ ...input, userId: ctx.userId }),
  })

  defineHandler({
    channel: 'rates:previewBulk',
    input: previewBulkRateInput,
    output: previewBulkRateOutput,
    roles: ['owner', 'operator'],
    handler: (input) => ({ items: getAppContext().customers.previewBulkRate(input) }),
  })

  defineHandler({
    channel: 'balances:recalculate',
    input: recalculateBalancesInput,
    output: recalculateBalancesOutput,
    roles: ['owner'],
    handler: (input) => getAppContext().balances.recalculate(input.customerId),
  })

  defineHandler({
    channel: 'customers:importParse',
    input: parseImportFileInput,
    output: parseImportFileOutput,
    roles: ['owner', 'operator'],
    handler: (input) => getAppContext().customerImport.parseFile(input.fileName, input.base64),
  })

  defineHandler({
    channel: 'customers:importValidate',
    input: validateImportInput,
    output: validateImportOutput,
    roles: ['owner', 'operator'],
    handler: (input) =>
      getAppContext().customerImport.validate(input.fileName, input.base64, input.mapping, {
        createMissingAreas: input.createMissingAreas,
        createMissingRoutes: input.createMissingRoutes,
      }),
  })

  defineHandler({
    channel: 'customers:importCommit',
    input: commitImportInput,
    output: commitImportOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) =>
      getAppContext().customerImport.commit(input.fileName, input.base64, input.mapping, {
        createMissingAreas: input.createMissingAreas,
        createMissingRoutes: input.createMissingRoutes,
        userId: ctx.userId,
      }),
  })

  defineHandler({
    channel: 'customers:importTemplate',
    input: z.object({}),
    output: importTemplateOutput,
    roles: 'authenticated',
    handler: () => getAppContext().customerImport.template(),
  })

  defineHandler({
    channel: 'dev:seedDemo',
    input: z.object({}),
    output: seedDemoOutput,
    roles: ['owner'],
    handler: (_input, ctx) => {
      if (process.env.NODE_ENV === 'production') {
        throw new AppError('FORBIDDEN', 'Demo seed is not available in production builds')
      }
      const ctxApp = getAppContext()
      return seedDemoCustomers(ctxApp.db, {
        audit: ctxApp.audit,
        period: ctxApp.period,
        rate: ctxApp.rates,
        balance: ctxApp.balances,
        userId: ctx.userId,
      })
    },
  })
}
