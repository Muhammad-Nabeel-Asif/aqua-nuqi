import { z } from 'zod'

export const areaDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  activeCustomerCount: z.number().int().optional(),
})
export type AreaDto = z.infer<typeof areaDto>

export const listAreasInput = z.object({
  includeInactive: z.boolean().optional(),
})
export const listAreasOutput = z.object({ items: z.array(areaDto) })

export const createAreaInput = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).optional().nullable(),
})
export const createAreaOutput = z.object({ item: areaDto })

export const updateAreaInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
})
export const updateAreaOutput = z.object({ item: areaDto })

export const routeDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  areaId: z.number().int().nullable(),
  areaName: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  activeCustomerCount: z.number().int().optional(),
})
export type RouteDto = z.infer<typeof routeDto>

export const listRoutesInput = z.object({
  includeInactive: z.boolean().optional(),
  areaId: z.number().int().positive().optional(),
})
export const listRoutesOutput = z.object({ items: z.array(routeDto) })

export const createRouteInput = z.object({
  name: z.string().trim().min(1).max(120),
  areaId: z.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().optional(),
})
export const createRouteOutput = z.object({ item: routeDto })

export const updateRouteInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  areaId: z.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
export const updateRouteOutput = z.object({ item: routeDto })

export const reorderRoutesInput = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
})
export const reorderRoutesOutput = z.object({ ok: z.literal(true) })

export const productKindSchema = z.enum([
  'returnable_bottle',
  'packaged_water',
  'equipment',
  'rental',
  'service',
])

export const productDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  sizeLiters: z.number().nullable(),
  kind: productKindSchema,
  isReturnable: z.boolean(),
  defaultRate: z.number().int(),
  defaultDeposit: z.number().int(),
  trackStock: z.boolean(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
})
export type ProductDto = z.infer<typeof productDto>

export const listProductsInput = z.object({
  includeInactive: z.boolean().optional(),
})
export const listProductsOutput = z.object({ items: z.array(productDto) })

export const createProductInput = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(60).optional().nullable(),
  sizeLiters: z.number().positive().optional().nullable(),
  kind: productKindSchema,
  isReturnable: z.boolean(),
  defaultRate: z.number().int().min(0),
  defaultDeposit: z.number().int().min(0),
  trackStock: z.boolean(),
})
export const createProductOutput = z.object({ item: productDto })

export const updateProductInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().max(60).optional().nullable(),
  sizeLiters: z.number().positive().optional().nullable(),
  kind: productKindSchema.optional(),
  isReturnable: z.boolean().optional(),
  defaultRate: z.number().int().min(0).optional(),
  defaultDeposit: z.number().int().min(0).optional(),
  trackStock: z.boolean().optional(),
  isActive: z.boolean().optional(),
})
export const updateProductOutput = z.object({ item: productDto })
