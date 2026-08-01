import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { expenseCategories, expenses, trips, vehicles } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type { CreateVehicleInput, UpdateVehicleInput, VehicleDto } from '@shared/contracts'
import { assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'

export function createVehicleService(db: AppDatabase, audit: AuditService) {
  function toDto(row: typeof vehicles.$inferSelect): VehicleDto {
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      registrationNo: row.registrationNo,
      vehicleType: row.vehicleType as VehicleDto['vehicleType'],
      capacityBottles: row.capacityBottles,
      isActive: row.isActive === 1,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  function list(includeInactive = false): { items: VehicleDto[] } {
    const rows = includeInactive
      ? db.select().from(vehicles).orderBy(vehicles.name).all()
      : db.select().from(vehicles).where(eq(vehicles.isActive, 1)).orderBy(vehicles.name).all()
    return { items: rows.map(toDto) }
  }

  function getById(id: number): VehicleDto {
    const row = db.select().from(vehicles).where(eq(vehicles.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Vehicle ${id} not found`)
    return toDto(row)
  }

  function create(input: CreateVehicleInput, userId?: number | null): VehicleDto {
    const name = input.name.trim()
    if (!name) throw new AppError('VALIDATION_FAILED', 'Vehicle name is required')
    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(vehicles)
        .values({
          uuid: newUuid(),
          name,
          registrationNo: input.registrationNo?.trim() || null,
          vehicleType: input.vehicleType ?? null,
          capacityBottles: input.capacityBottles ?? null,
          isActive: input.isActive === false ? 0 : 1,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'vehicles',
          entityId: inserted.id,
          summary: `Created vehicle ${name}`,
          after: inserted,
        },
        tx,
      )
      return inserted
    })
    return toDto(row)
  }

  function update(input: UpdateVehicleInput, userId?: number | null): VehicleDto {
    const existing = db.select().from(vehicles).where(eq(vehicles.id, input.id)).get()
    if (!existing) throw new AppError('NOT_FOUND', `Vehicle ${input.id} not found`)
    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(vehicles)
        .set({
          name: input.name !== undefined ? input.name.trim() : existing.name,
          registrationNo:
            input.registrationNo !== undefined
              ? input.registrationNo?.trim() || null
              : existing.registrationNo,
          vehicleType: input.vehicleType !== undefined ? input.vehicleType : existing.vehicleType,
          capacityBottles:
            input.capacityBottles !== undefined ? input.capacityBottles : existing.capacityBottles,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          isActive: input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive,
          updatedAt: now,
        })
        .where(eq(vehicles.id, input.id))
        .run()
      const after = tx.select().from(vehicles).where(eq(vehicles.id, input.id)).get()!
      audit.record(
        {
          userId,
          action: 'update',
          entityTable: 'vehicles',
          entityId: input.id,
          summary: `Updated vehicle ${after.name}`,
          before: existing,
          after,
        },
        tx,
      )
    })
    return getById(input.id)
  }

  function getDetail(
    id: number,
    from?: string,
    to?: string,
  ): {
    item: VehicleDto
    tripsCount: number
    bottlesCarried: number
    fuelAndMaintenanceTotal: number
    costPerBottleCarried: number | null
    expenses: Array<{
      id: number
      expenseDate: string
      categoryName: string
      amount: number
      description: string | null
    }>
    trips: Array<{
      id: number
      tripDate: string
      status: 'open' | 'closed' | 'void'
      filledLoaded: number
      bottlesDeliveredCalc: number
      cashVariance: number
      bottleVariance: number
    }>
  } {
    const item = getById(id)
    if (from) assertBusinessDate(from)
    if (to) assertBusinessDate(to)

    const tripConditions = [eq(trips.vehicleId, id), sql`${trips.status} != 'void'`]
    if (from) tripConditions.push(gte(trips.tripDate, from))
    if (to) tripConditions.push(lte(trips.tripDate, to))

    const tripRows = db
      .select()
      .from(trips)
      .where(and(...tripConditions))
      .orderBy(desc(trips.tripDate))
      .all()

    const bottlesCarried = tripRows.reduce((s, t) => s + t.filledLoaded, 0)

    const expConditions = [
      eq(expenses.vehicleId, id),
      eq(expenses.status, 'active'),
      sql`lower(${expenseCategories.name}) IN ('fuel', 'vehicle maintenance')`,
    ]
    if (from) expConditions.push(gte(expenses.expenseDate, from))
    if (to) expConditions.push(lte(expenses.expenseDate, to))

    const expRows = db
      .select({
        id: expenses.id,
        expenseDate: expenses.expenseDate,
        categoryName: expenseCategories.name,
        amount: expenses.amount,
        description: expenses.description,
      })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(and(...expConditions))
      .orderBy(desc(expenses.expenseDate))
      .all()

    const fuelAndMaintenanceTotal = expRows.reduce((s, e) => s + e.amount, 0)

    return {
      item,
      tripsCount: tripRows.length,
      bottlesCarried,
      fuelAndMaintenanceTotal,
      costPerBottleCarried:
        bottlesCarried > 0 ? Math.round(fuelAndMaintenanceTotal / bottlesCarried) : null,
      expenses: expRows,
      trips: tripRows.map((t) => ({
        id: t.id,
        tripDate: t.tripDate,
        status: t.status as 'open' | 'closed' | 'void',
        filledLoaded: t.filledLoaded,
        bottlesDeliveredCalc: t.bottlesDeliveredCalc,
        cashVariance: t.cashVariance,
        bottleVariance: t.bottleVariance,
      })),
    }
  }

  return { list, getById, create, update, getDetail }
}

export type VehicleService = ReturnType<typeof createVehicleService>
