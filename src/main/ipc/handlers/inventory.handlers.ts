import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  closeTripInput,
  closeTripOutput,
  createVehicleInput,
  createVehicleOutput,
  employeeVarianceSummaryInput,
  employeeVarianceSummaryOutput,
  getStockBalancesInput,
  getStockBalancesOutput,
  getTripInput,
  getTripOutput,
  getVehicleInput,
  getVehicleOutput,
  inventoryBottlesOutInput,
  inventoryBottlesOutOutput,
  listStockMovementsInput,
  listStockMovementsOutput,
  listTripsInput,
  listTripsOutput,
  listVehiclesInput,
  listVehiclesOutput,
  purchaseBottlesInput,
  purchaseBottlesOutput,
  recordAdjustmentInput,
  recordAdjustmentOutput,
  recordBottleReturnInput,
  recordBottleReturnOutput,
  recordDamageInput,
  recordDamageOutput,
  recordOpeningStockInput,
  recordOpeningStockOutput,
  recordProductionInput,
  recordProductionOutput,
  startTripInput,
  startTripOutput,
  updateVehicleInput,
  updateVehicleOutput,
  voidTripInput,
  voidTripOutput,
} from '@shared/contracts'

export function registerInventoryHandlers(): void {
  defineHandler({
    channel: 'inventory:getBalances',
    roles: ['owner', 'operator'],
    input: getStockBalancesInput,
    output: getStockBalancesOutput,
    handler: async (input) => {
      const { stock } = getAppContext()
      return stock.getBalances(input.asOf, input.productId)
    },
  })

  defineHandler({
    channel: 'inventory:listMovements',
    roles: ['owner', 'operator'],
    input: listStockMovementsInput,
    output: listStockMovementsOutput,
    handler: async (input) => {
      const { stock } = getAppContext()
      return stock.listMovements(input)
    },
  })

  defineHandler({
    channel: 'inventory:recordOpeningStock',
    roles: ['owner'],
    input: recordOpeningStockInput,
    output: recordOpeningStockOutput,
    handler: async (input, ctx) => {
      const { stock } = getAppContext()
      const item = stock.recordOpeningStock({ ...input, userId: ctx.userId })
      return { item }
    },
  })

  defineHandler({
    channel: 'inventory:purchaseBottles',
    roles: ['owner'],
    input: purchaseBottlesInput,
    output: purchaseBottlesOutput,
    handler: async (input, ctx) => {
      const { stock } = getAppContext()
      return stock.purchaseBottles({ ...input, userId: ctx.userId! })
    },
  })

  defineHandler({
    channel: 'inventory:recordProduction',
    roles: ['owner', 'operator'],
    input: recordProductionInput,
    output: recordProductionOutput,
    handler: async (input, ctx) => {
      const { stock } = getAppContext()
      return stock.recordProduction({ ...input, userId: ctx.userId })
    },
  })

  defineHandler({
    channel: 'inventory:recordDamage',
    roles: ['owner'],
    input: recordDamageInput,
    output: recordDamageOutput,
    handler: async (input, ctx) => {
      const { stock } = getAppContext()
      return stock.recordDamage({ ...input, userId: ctx.userId })
    },
  })

  defineHandler({
    channel: 'inventory:recordAdjustment',
    roles: ['owner'],
    input: recordAdjustmentInput,
    output: recordAdjustmentOutput,
    handler: async (input, ctx) => {
      const { stock } = getAppContext()
      const item = stock.recordAdjustment({ ...input, userId: ctx.userId })
      return { item }
    },
  })

  defineHandler({
    channel: 'inventory:bottlesOut',
    roles: ['owner', 'operator'],
    input: inventoryBottlesOutInput,
    output: inventoryBottlesOutOutput,
    handler: async (input) => {
      const { stock } = getAppContext()
      return stock.listBottlesOut(input)
    },
  })

  defineHandler({
    channel: 'inventory:recordBottleReturn',
    roles: ['owner', 'operator'],
    input: recordBottleReturnInput,
    output: recordBottleReturnOutput,
    handler: async (input, ctx) => {
      const { deliveries, balances } = getAppContext()
      const d = deliveries.upsertDelivery({
        customerId: input.customerId,
        date: input.date,
        productId: input.productId,
        quantity: 0,
        emptiesCollected: input.empties,
        notes: input.notes ?? 'Bottle return (no delivery)',
        userId: ctx.userId,
      })
      return {
        deliveryId: d.id,
        bottlesWithCustomer: balances.computeLiveBottles(input.customerId),
      }
    },
  })

  defineHandler({
    channel: 'vehicles:list',
    roles: ['owner', 'operator'],
    input: listVehiclesInput,
    output: listVehiclesOutput,
    handler: async (input) => {
      const { vehicles } = getAppContext()
      return vehicles.list(input.includeInactive ?? false)
    },
  })

  defineHandler({
    channel: 'vehicles:get',
    roles: ['owner', 'operator'],
    input: getVehicleInput,
    output: getVehicleOutput,
    handler: async (input) => {
      const { vehicles } = getAppContext()
      return vehicles.getDetail(input.id, input.from, input.to)
    },
  })

  defineHandler({
    channel: 'vehicles:create',
    roles: ['owner'],
    input: createVehicleInput,
    output: createVehicleOutput,
    handler: async (input, ctx) => {
      const { vehicles } = getAppContext()
      return { item: vehicles.create(input, ctx.userId) }
    },
  })

  defineHandler({
    channel: 'vehicles:update',
    roles: ['owner'],
    input: updateVehicleInput,
    output: updateVehicleOutput,
    handler: async (input, ctx) => {
      const { vehicles } = getAppContext()
      return { item: vehicles.update(input, ctx.userId) }
    },
  })

  defineHandler({
    channel: 'trips:list',
    roles: ['owner', 'operator'],
    input: listTripsInput,
    output: listTripsOutput,
    handler: async (input) => {
      const { trips } = getAppContext()
      return trips.list(input)
    },
  })

  defineHandler({
    channel: 'trips:get',
    roles: ['owner', 'operator'],
    input: getTripInput,
    output: getTripOutput,
    handler: async (input) => {
      const { trips } = getAppContext()
      return trips.getReconciliation(input.id)
    },
  })

  defineHandler({
    channel: 'trips:start',
    roles: ['owner', 'operator'],
    input: startTripInput,
    output: startTripOutput,
    handler: async (input, ctx) => {
      const { trips } = getAppContext()
      return { item: trips.startTrip({ ...input, userId: ctx.userId }) }
    },
  })

  defineHandler({
    channel: 'trips:close',
    roles: ['owner', 'operator'],
    input: closeTripInput,
    output: closeTripOutput,
    handler: async (input, ctx) => {
      const { trips } = getAppContext()
      return { item: trips.closeTrip({ ...input, userId: ctx.userId }) }
    },
  })

  defineHandler({
    channel: 'trips:void',
    roles: ['owner'],
    input: voidTripInput,
    output: voidTripOutput,
    handler: async (input, ctx) => {
      const { trips } = getAppContext()
      return { item: trips.voidTrip(input.id, input.reason, ctx.userId) }
    },
  })

  defineHandler({
    channel: 'trips:employeeVarianceSummary',
    roles: ['owner'],
    input: employeeVarianceSummaryInput,
    output: employeeVarianceSummaryOutput,
    handler: async (input) => {
      const { trips } = getAppContext()
      return trips.employeeVarianceSummary(input.from, input.to)
    },
  })
}
