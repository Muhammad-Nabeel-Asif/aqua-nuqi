import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  createAreaInput,
  createAreaOutput,
  createProductInput,
  createProductOutput,
  createRouteInput,
  createRouteOutput,
  listAreasInput,
  listAreasOutput,
  listProductsInput,
  listProductsOutput,
  listRoutesInput,
  listRoutesOutput,
  reorderRoutesInput,
  reorderRoutesOutput,
  updateAreaInput,
  updateAreaOutput,
  updateProductInput,
  updateProductOutput,
  updateRouteInput,
  updateRouteOutput,
} from '@shared/contracts'

export function registerMasterDataHandlers(): void {
  defineHandler({
    channel: 'areas:list',
    input: listAreasInput,
    output: listAreasOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().masterData.listAreas(input.includeInactive ?? false),
    }),
  })

  defineHandler({
    channel: 'areas:create',
    input: createAreaInput,
    output: createAreaOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.createArea(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'areas:update',
    input: updateAreaInput,
    output: updateAreaOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.updateArea(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'routes:list',
    input: listRoutesInput,
    output: listRoutesOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().masterData.listRoutes(input),
    }),
  })

  defineHandler({
    channel: 'routes:create',
    input: createRouteInput,
    output: createRouteOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.createRoute(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'routes:update',
    input: updateRouteInput,
    output: updateRouteOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.updateRoute(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'routes:reorder',
    input: reorderRoutesInput,
    output: reorderRoutesOutput,
    roles: ['owner', 'operator'],
    handler: (input, ctx) => {
      getAppContext().masterData.reorderRoutes(input.orderedIds, ctx.userId)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'products:list',
    input: listProductsInput,
    output: listProductsOutput,
    roles: 'authenticated',
    handler: (input) => ({
      items: getAppContext().masterData.listProducts(input.includeInactive ?? false),
    }),
  })

  defineHandler({
    channel: 'products:create',
    input: createProductInput,
    output: createProductOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.createProduct(input, ctx.userId),
    }),
  })

  defineHandler({
    channel: 'products:update',
    input: updateProductInput,
    output: updateProductOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: getAppContext().masterData.updateProduct(input, ctx.userId),
    }),
  })
}
