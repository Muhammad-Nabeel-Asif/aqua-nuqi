import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { areas, customers, products, routes } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type { AreaDto, ProductDto, RouteDto } from '@shared/contracts'
import { nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'

function toAreaDto(row: typeof areas.$inferSelect, activeCustomerCount?: number): AreaDto {
  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    notes: row.notes,
    isActive: row.isActive === 1,
    activeCustomerCount,
  }
}

function toRouteDto(
  row: typeof routes.$inferSelect,
  extras?: { areaName?: string | null; activeCustomerCount?: number },
): RouteDto {
  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    areaId: row.areaId,
    areaName: extras?.areaName ?? null,
    sortOrder: row.sortOrder,
    notes: row.notes,
    isActive: row.isActive === 1,
    activeCustomerCount: extras?.activeCustomerCount,
  }
}

function toProductDto(row: typeof products.$inferSelect): ProductDto {
  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    sku: row.sku,
    sizeLiters: row.sizeLiters,
    kind: row.kind as ProductDto['kind'],
    isReturnable: row.isReturnable === 1,
    defaultRate: row.defaultRate,
    defaultDeposit: row.defaultDeposit,
    trackStock: row.trackStock === 1,
    isDefault: row.isDefault === 1,
    isActive: row.isActive === 1,
  }
}

export function createMasterDataService(db: AppDatabase, audit: AuditService) {
  // ── Areas ──────────────────────────────────────────────────────────
  function listAreas(includeInactive = false): AreaDto[] {
    const rows = db
      .select()
      .from(areas)
      .where(
        includeInactive
          ? isNull(areas.deletedAt)
          : and(isNull(areas.deletedAt), eq(areas.isActive, 1)),
      )
      .orderBy(asc(areas.name))
      .all()

    return rows.map((row) => {
      const count = db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.areaId, row.id),
            eq(customers.status, 'active'),
            isNull(customers.deletedAt),
          ),
        )
        .all().length
      return toAreaDto(row, count)
    })
  }

  function createArea(
    input: { name: string; notes?: string | null },
    userId?: number | null,
  ): AreaDto {
    const name = input.name.trim()
    const clash = db
      .select()
      .from(areas)
      .where(and(eq(areas.name, name), isNull(areas.deletedAt)))
      .get()
    if (clash) throw new AppError('CONFLICT', `Area "${name}" already exists`)

    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(areas)
        .values({
          uuid: newUuid(),
          name,
          notes: input.notes ?? null,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'areas',
          entityId: inserted.id,
          summary: `Created area ${name}`,
          after: toAreaDto(inserted),
        },
        tx,
      )
      return inserted
    })
    return toAreaDto(row, 0)
  }

  function updateArea(
    input: { id: number; name?: string; notes?: string | null; isActive?: boolean },
    userId?: number | null,
  ): AreaDto {
    const existing = db.select().from(areas).where(eq(areas.id, input.id)).get()
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Area not found')

    if (input.isActive === false) {
      const active = db
        .select({ id: customers.id, code: customers.code, name: customers.name })
        .from(customers)
        .where(
          and(
            eq(customers.areaId, input.id),
            eq(customers.status, 'active'),
            isNull(customers.deletedAt),
          ),
        )
        .all()
      if (active.length > 0) {
        throw new AppError(
          'CONFLICT',
          `Cannot deactivate area "${existing.name}" — used by ${active.length} active customer(s): ${active
            .slice(0, 5)
            .map((c) => c.code)
            .join(', ')}${active.length > 5 ? '…' : ''}`,
          { customers: active },
        )
      }
    }

    if (input.name && input.name.trim() !== existing.name) {
      const clash = db
        .select()
        .from(areas)
        .where(
          and(eq(areas.name, input.name.trim()), isNull(areas.deletedAt), ne(areas.id, input.id)),
        )
        .get()
      if (clash) throw new AppError('CONFLICT', `Area "${input.name.trim()}" already exists`)
    }

    const before = toAreaDto(existing)
    const updated = db.transaction((tx) => {
      const row = tx
        .update(areas)
        .set({
          name: input.name?.trim() ?? existing.name,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive,
          updatedAt: nowIsoUtc(),
        })
        .where(eq(areas.id, input.id))
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'areas',
          entityId: row.id,
          summary: `Updated area ${row.name}`,
          before,
          after: toAreaDto(row),
        },
        tx,
      )
      return row
    })
    return toAreaDto(updated)
  }

  // ── Routes ─────────────────────────────────────────────────────────
  function listRoutes(opts: { includeInactive?: boolean; areaId?: number } = {}): RouteDto[] {
    const rows = db
      .select()
      .from(routes)
      .where(isNull(routes.deletedAt))
      .orderBy(asc(routes.sortOrder), asc(routes.name))
      .all()
    return rows
      .filter((r) => {
        if (!opts.includeInactive && r.isActive !== 1) return false
        if (opts.areaId && r.areaId !== opts.areaId) return false
        return true
      })
      .map((row) => {
        const area = row.areaId
          ? db.select().from(areas).where(eq(areas.id, row.areaId)).get()
          : null
        const count = db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.routeId, row.id),
              eq(customers.status, 'active'),
              isNull(customers.deletedAt),
            ),
          )
          .all().length
        return toRouteDto(row, { areaName: area?.name ?? null, activeCustomerCount: count })
      })
  }

  function createRoute(
    input: {
      name: string
      areaId?: number | null
      notes?: string | null
      sortOrder?: number
    },
    userId?: number | null,
  ): RouteDto {
    const name = input.name.trim()
    const clash = db
      .select()
      .from(routes)
      .where(and(eq(routes.name, name), isNull(routes.deletedAt)))
      .get()
    if (clash) throw new AppError('CONFLICT', `Route "${name}" already exists`)

    const maxSort = db.select().from(routes).where(isNull(routes.deletedAt)).all()
    const sortOrder = input.sortOrder ?? maxSort.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1

    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(routes)
        .values({
          uuid: newUuid(),
          name,
          areaId: input.areaId ?? null,
          notes: input.notes ?? null,
          sortOrder,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'routes',
          entityId: inserted.id,
          summary: `Created route ${name}`,
          after: toRouteDto(inserted),
        },
        tx,
      )
      return inserted
    })
    return toRouteDto(row, { activeCustomerCount: 0 })
  }

  function updateRoute(
    input: {
      id: number
      name?: string
      areaId?: number | null
      notes?: string | null
      isActive?: boolean
      sortOrder?: number
    },
    userId?: number | null,
  ): RouteDto {
    const existing = db.select().from(routes).where(eq(routes.id, input.id)).get()
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Route not found')

    if (input.isActive === false) {
      const active = db
        .select({ id: customers.id, code: customers.code, name: customers.name })
        .from(customers)
        .where(
          and(
            eq(customers.routeId, input.id),
            eq(customers.status, 'active'),
            isNull(customers.deletedAt),
          ),
        )
        .all()
      if (active.length > 0) {
        throw new AppError(
          'CONFLICT',
          `Cannot deactivate route "${existing.name}" — used by ${active.length} active customer(s): ${active
            .slice(0, 5)
            .map((c) => c.code)
            .join(', ')}${active.length > 5 ? '…' : ''}`,
          { customers: active },
        )
      }
    }

    if (input.name && input.name.trim() !== existing.name) {
      const clash = db
        .select()
        .from(routes)
        .where(
          and(
            eq(routes.name, input.name.trim()),
            isNull(routes.deletedAt),
            ne(routes.id, input.id),
          ),
        )
        .get()
      if (clash) throw new AppError('CONFLICT', `Route "${input.name.trim()}" already exists`)
    }

    const before = toRouteDto(existing)
    const updated = db.transaction((tx) => {
      const row = tx
        .update(routes)
        .set({
          name: input.name?.trim() ?? existing.name,
          areaId: input.areaId !== undefined ? input.areaId : existing.areaId,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          updatedAt: nowIsoUtc(),
        })
        .where(eq(routes.id, input.id))
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'routes',
          entityId: row.id,
          summary: `Updated route ${row.name}`,
          before,
          after: toRouteDto(row),
        },
        tx,
      )
      return row
    })
    return toRouteDto(updated)
  }

  function reorderRoutes(orderedIds: number[], userId?: number | null): void {
    db.transaction((tx) => {
      orderedIds.forEach((id, index) => {
        tx.update(routes)
          .set({ sortOrder: index, updatedAt: nowIsoUtc() })
          .where(eq(routes.id, id))
          .run()
      })
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'routes',
          summary: `Reordered ${orderedIds.length} routes`,
          after: { orderedIds },
        },
        tx,
      )
    })
  }

  // ── Products ───────────────────────────────────────────────────────
  function listProducts(includeInactive = false): ProductDto[] {
    const rows = db.select().from(products).where(isNull(products.deletedAt)).all()
    return rows.filter((r) => includeInactive || r.isActive === 1).map(toProductDto)
  }

  function createProduct(
    input: {
      name: string
      sku?: string | null
      sizeLiters?: number | null
      kind: ProductDto['kind']
      isReturnable: boolean
      defaultRate: number
      defaultDeposit: number
      trackStock: boolean
    },
    userId?: number | null,
  ): ProductDto {
    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(products)
        .values({
          uuid: newUuid(),
          name: input.name.trim(),
          sku: input.sku?.trim() || null,
          sizeLiters: input.sizeLiters ?? null,
          kind: input.kind,
          isReturnable: input.isReturnable ? 1 : 0,
          defaultRate: input.defaultRate,
          defaultDeposit: input.defaultDeposit,
          trackStock: input.trackStock ? 1 : 0,
          isDefault: 0,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'products',
          entityId: inserted.id,
          summary: `Created product ${inserted.name}`,
          after: toProductDto(inserted),
        },
        tx,
      )
      return inserted
    })
    return toProductDto(row)
  }

  function updateProduct(
    input: {
      id: number
      name?: string
      sku?: string | null
      sizeLiters?: number | null
      kind?: ProductDto['kind']
      isReturnable?: boolean
      defaultRate?: number
      defaultDeposit?: number
      trackStock?: boolean
      isActive?: boolean
    },
    userId?: number | null,
  ): ProductDto {
    const existing = db.select().from(products).where(eq(products.id, input.id)).get()
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Product not found')

    if (input.isActive === false && existing.isDefault === 1) {
      throw new AppError('CONFLICT', 'The default product cannot be deactivated or deleted')
    }

    const before = toProductDto(existing)
    const updated = db.transaction((tx) => {
      const row = tx
        .update(products)
        .set({
          name: input.name?.trim() ?? existing.name,
          sku: input.sku !== undefined ? input.sku?.trim() || null : existing.sku,
          sizeLiters: input.sizeLiters !== undefined ? input.sizeLiters : existing.sizeLiters,
          kind: input.kind ?? existing.kind,
          isReturnable:
            input.isReturnable !== undefined ? (input.isReturnable ? 1 : 0) : existing.isReturnable,
          defaultRate: input.defaultRate ?? existing.defaultRate,
          defaultDeposit: input.defaultDeposit ?? existing.defaultDeposit,
          trackStock:
            input.trackStock !== undefined ? (input.trackStock ? 1 : 0) : existing.trackStock,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive,
          updatedAt: nowIsoUtc(),
        })
        .where(eq(products.id, input.id))
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'products',
          entityId: row.id,
          summary: `Updated product ${row.name}`,
          before,
          after: toProductDto(row),
        },
        tx,
      )
      return row
    })
    return toProductDto(updated)
  }

  function getOrCreateAreaByName(
    name: string,
    userId?: number | null,
    tx: AppDatabase = db,
  ): number {
    const trimmed = name.trim()
    const existing = tx
      .select()
      .from(areas)
      .where(and(eq(areas.name, trimmed), isNull(areas.deletedAt)))
      .get()
    if (existing) return existing.id
    const now = nowIsoUtc()
    const row = tx
      .insert(areas)
      .values({
        uuid: newUuid(),
        name: trimmed,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    audit.record(
      {
        userId,
        action: 'create',
        entityTable: 'areas',
        entityId: row.id,
        summary: `Created area ${trimmed} (import)`,
        after: toAreaDto(row),
      },
      tx,
    )
    return row.id
  }

  function getOrCreateRouteByName(
    name: string,
    areaId: number | null,
    userId?: number | null,
    tx: AppDatabase = db,
  ): number {
    const trimmed = name.trim()
    const existing = tx
      .select()
      .from(routes)
      .where(and(eq(routes.name, trimmed), isNull(routes.deletedAt)))
      .get()
    if (existing) return existing.id
    const now = nowIsoUtc()
    const row = tx
      .insert(routes)
      .values({
        uuid: newUuid(),
        name: trimmed,
        areaId,
        sortOrder: 0,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    audit.record(
      {
        userId,
        action: 'create',
        entityTable: 'routes',
        entityId: row.id,
        summary: `Created route ${trimmed} (import)`,
        after: toRouteDto(row),
      },
      tx,
    )
    return row.id
  }

  return {
    listAreas,
    createArea,
    updateArea,
    listRoutes,
    createRoute,
    updateRoute,
    reorderRoutes,
    listProducts,
    createProduct,
    updateProduct,
    getOrCreateAreaByName,
    getOrCreateRouteByName,
  }
}

export type MasterDataService = ReturnType<typeof createMasterDataService>
