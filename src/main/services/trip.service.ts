import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { deliveries, employees, routes, stockMovements, trips, vehicles } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type { CloseTripInput, StartTripInput, TripDto } from '@shared/contracts'
import { assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { PeriodService } from './period.service'
import type { RateService } from './rate.service'
import type { StockService } from './stock.service'

export function createTripService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  rates: RateService,
  stock: StockService,
) {
  function linkedTotals(tripId: number): {
    bottlesDelivered: number
    emptiesCollected: number
    cashCollected: number
  } {
    const row = db
      .select({
        bottlesDelivered: sql<number>`coalesce(sum(${deliveries.quantity}), 0)`,
        emptiesCollected: sql<number>`coalesce(sum(${deliveries.emptiesCollected}), 0)`,
        cashCollected: sql<number>`coalesce(sum(${deliveries.cashCollected}), 0)`,
      })
      .from(deliveries)
      .where(and(eq(deliveries.tripId, tripId), eq(deliveries.status, 'recorded')))
      .get()
    return {
      bottlesDelivered: Number(row?.bottlesDelivered ?? 0),
      emptiesCollected: Number(row?.emptiesCollected ?? 0),
      cashCollected: Number(row?.cashCollected ?? 0),
    }
  }

  function toDto(row: typeof trips.$inferSelect, extras?: Partial<TripDto>): TripDto {
    const linked = linkedTotals(row.id)
    return {
      id: row.id,
      uuid: row.uuid,
      tripDate: row.tripDate,
      employeeId: row.employeeId,
      employeeName: extras?.employeeName ?? null,
      vehicleId: row.vehicleId,
      vehicleName: extras?.vehicleName ?? null,
      routeId: row.routeId,
      routeName: extras?.routeName ?? null,
      filledLoaded: row.filledLoaded,
      filledReturned: row.filledReturned,
      emptiesReturned: row.emptiesReturned,
      bottlesDeliveredCalc:
        row.status === 'open' ? linked.bottlesDelivered : row.bottlesDeliveredCalc,
      cashExpected: row.status === 'open' ? linked.cashCollected : row.cashExpected,
      cashSubmitted: row.cashSubmitted,
      cashVariance: row.cashVariance,
      bottleVariance: row.bottleVariance,
      emptiesExpected: linked.emptiesCollected,
      status: row.status as TripDto['status'],
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
    }
  }

  function hydrate(row: typeof trips.$inferSelect): TripDto {
    const emp = row.employeeId
      ? db.select().from(employees).where(eq(employees.id, row.employeeId)).get()
      : null
    const veh = row.vehicleId
      ? db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId)).get()
      : null
    const route = row.routeId
      ? db.select().from(routes).where(eq(routes.id, row.routeId)).get()
      : null
    return toDto(row, {
      employeeName: emp?.name ?? null,
      vehicleName: veh?.name ?? null,
      routeName: route?.name ?? null,
    })
  }

  function getById(id: number): TripDto {
    const row = db.select().from(trips).where(eq(trips.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Trip ${id} not found`)
    return hydrate(row)
  }

  function getReconciliation(id: number) {
    const row = db.select().from(trips).where(eq(trips.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Trip ${id} not found`)
    const linked = linkedTotals(id)
    const filledExpected = row.filledLoaded - linked.bottlesDelivered
    const filledActual = row.status === 'closed' ? row.filledReturned : null
    const emptiesActual = row.status === 'closed' ? row.emptiesReturned : null
    const cashActual = row.status === 'closed' ? row.cashSubmitted : null
    return {
      item: hydrate(row),
      reconciliation: {
        filledExpected,
        filledActual,
        filledVariance: filledActual == null ? null : filledActual - filledExpected,
        emptiesExpected: linked.emptiesCollected,
        emptiesActual,
        emptiesVariance: emptiesActual == null ? null : emptiesActual - linked.emptiesCollected,
        cashExpected: linked.cashCollected,
        cashActual,
        cashVariance: cashActual == null ? null : cashActual - linked.cashCollected,
      },
    }
  }

  function list(filters: {
    from?: string
    to?: string
    employeeId?: number
    vehicleId?: number
    status?: 'open' | 'closed' | 'void'
  }): { items: TripDto[] } {
    const conditions = []
    if (filters.from) {
      assertBusinessDate(filters.from)
      conditions.push(gte(trips.tripDate, filters.from))
    }
    if (filters.to) {
      assertBusinessDate(filters.to)
      conditions.push(lte(trips.tripDate, filters.to))
    }
    if (filters.employeeId) conditions.push(eq(trips.employeeId, filters.employeeId))
    if (filters.vehicleId) conditions.push(eq(trips.vehicleId, filters.vehicleId))
    if (filters.status) conditions.push(eq(trips.status, filters.status))

    const rows = db
      .select()
      .from(trips)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(trips.tripDate), desc(trips.id))
      .all()
    return { items: rows.map(hydrate) }
  }

  /**
   * Find an open trip matching employee + date for auto-linking deliveries.
   * Trips are optional — returns null when none match.
   */
  function findOpenTripForEmployeeDate(
    employeeId: number | null | undefined,
    date: string,
  ): { id: number; vehicleId: number | null } | null {
    if (employeeId == null) return null
    const row = db
      .select({ id: trips.id, vehicleId: trips.vehicleId })
      .from(trips)
      .where(
        and(eq(trips.employeeId, employeeId), eq(trips.tripDate, date), eq(trips.status, 'open')),
      )
      .orderBy(desc(trips.id))
      .get()
    return row ?? null
  }

  function startTrip(input: StartTripInput & { userId?: number | null }): TripDto {
    assertBusinessDate(input.tripDate)
    period.guardPeriodOpen(input.tripDate)

    const vehicle = db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).get()
    if (!vehicle || vehicle.isActive !== 1) {
      throw new AppError('NOT_FOUND', 'Vehicle not found or inactive')
    }

    const productId = rates.resolveDefaultProductId(input.productId)
    const emptiesLoaded = input.emptiesLoaded ?? 0
    const now = nowIsoUtc()

    const row = db.transaction((tx) => {
      const inserted = tx
        .insert(trips)
        .values({
          uuid: newUuid(),
          tripDate: input.tripDate,
          employeeId: input.employeeId ?? null,
          vehicleId: input.vehicleId,
          routeId: input.routeId ?? null,
          filledLoaded: input.filledLoaded,
          filledReturned: 0,
          emptiesReturned: 0,
          bottlesDeliveredCalc: 0,
          cashExpected: 0,
          cashSubmitted: 0,
          cashVariance: 0,
          bottleVariance: 0,
          status: 'open',
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
          createdBy: input.userId ?? null,
        })
        .returning()
        .get()

      // filled: plant → van (load_to_van)
      stock.record(tx, {
        movementDate: input.tripDate,
        productId,
        bottleState: 'filled',
        quantity: input.filledLoaded,
        fromLocation: 'plant',
        toLocation: 'van',
        reason: 'load_to_van',
        vehicleId: input.vehicleId,
        refTable: 'trips',
        refId: inserted.id,
        createdBy: input.userId ?? null,
      })

      if (emptiesLoaded > 0) {
        stock.record(tx, {
          movementDate: input.tripDate,
          productId,
          bottleState: 'empty',
          quantity: emptiesLoaded,
          fromLocation: 'plant',
          toLocation: 'van',
          reason: 'load_to_van',
          vehicleId: input.vehicleId,
          refTable: 'trips',
          refId: inserted.id,
          notes: 'Empties loaded',
          createdBy: input.userId ?? null,
        })
      }

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'trips',
          entityId: inserted.id,
          summary: `Started trip on ${input.tripDate}: loaded ${input.filledLoaded} filled`,
          after: inserted,
        },
        tx,
      )
      return inserted
    })

    return hydrate(row)
  }

  function closeTrip(input: CloseTripInput & { userId?: number | null }): TripDto {
    const existing = db.select().from(trips).where(eq(trips.id, input.id)).get()
    if (!existing) throw new AppError('NOT_FOUND', `Trip ${input.id} not found`)
    if (existing.status !== 'open') {
      throw new AppError('CONFLICT', 'Only open trips can be closed')
    }
    period.guardPeriodOpen(existing.tripDate)

    const linked = linkedTotals(existing.id)
    const filledExpected = existing.filledLoaded - linked.bottlesDelivered
    const bottleVariance = input.filledReturned - filledExpected
    // Also consider empties variance in the "any variance" note requirement
    const emptiesVariance = input.emptiesReturned - linked.emptiesCollected
    const cashVariance = input.cashSubmitted - linked.cashCollected
    const anyVariance = bottleVariance !== 0 || emptiesVariance !== 0 || cashVariance !== 0

    if (anyVariance && !input.notes?.trim()) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A note is required when filled, empties, or cash variance is non-zero',
        {
          bottleVariance,
          emptiesVariance,
          cashVariance,
        },
      )
    }

    const productId = rates.resolveDefaultProductId(input.productId)
    const now = nowIsoUtc()

    db.transaction((tx) => {
      // Unload: filled van → plant, empty van → plant
      if (input.filledReturned > 0) {
        stock.record(tx, {
          movementDate: existing.tripDate,
          productId,
          bottleState: 'filled',
          quantity: input.filledReturned,
          fromLocation: 'van',
          toLocation: 'plant',
          reason: 'unload_from_van',
          vehicleId: existing.vehicleId,
          refTable: 'trips',
          refId: existing.id,
          createdBy: input.userId ?? null,
        })
      }
      if (input.emptiesReturned > 0) {
        stock.record(tx, {
          movementDate: existing.tripDate,
          productId,
          bottleState: 'empty',
          quantity: input.emptiesReturned,
          fromLocation: 'van',
          toLocation: 'plant',
          reason: 'unload_from_van',
          vehicleId: existing.vehicleId,
          refTable: 'trips',
          refId: existing.id,
          createdBy: input.userId ?? null,
        })
      }

      tx.update(trips)
        .set({
          filledReturned: input.filledReturned,
          emptiesReturned: input.emptiesReturned,
          bottlesDeliveredCalc: linked.bottlesDelivered,
          cashExpected: linked.cashCollected,
          cashSubmitted: input.cashSubmitted,
          cashVariance,
          bottleVariance,
          status: 'closed',
          notes: input.notes?.trim() || existing.notes,
          updatedAt: now,
        })
        .where(eq(trips.id, existing.id))
        .run()

      const after = tx.select().from(trips).where(eq(trips.id, existing.id)).get()!
      audit.record(
        {
          userId: input.userId,
          action: 'update',
          entityTable: 'trips',
          entityId: existing.id,
          summary: `Closed trip #${existing.id}: bottle var ${bottleVariance}, cash var ${cashVariance}`,
          before: existing,
          after,
        },
        tx,
      )
    })

    return getById(existing.id)
  }

  function voidTrip(id: number, reason: string, userId?: number | null): TripDto {
    const existing = db.select().from(trips).where(eq(trips.id, id)).get()
    if (!existing) throw new AppError('NOT_FOUND', `Trip ${id} not found`)
    if (existing.status === 'void') return hydrate(existing)
    period.guardPeriodOpen(existing.tripDate)

    // Cannot void if deliveries are still linked
    const linked = db
      .select({ n: sql<number>`count(*)` })
      .from(deliveries)
      .where(and(eq(deliveries.tripId, id), eq(deliveries.status, 'recorded')))
      .get()
    if (Number(linked?.n ?? 0) > 0) {
      throw new AppError('CONFLICT', 'Unlink or void linked deliveries before voiding this trip')
    }

    const now = nowIsoUtc()
    db.transaction((tx) => {
      // Reverse trip load/unload movements by deleting trip-linked rows and
      // writing opposite movements so the ledger stays consistent.
      const movs = tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.refTable, 'trips'), eq(stockMovements.refId, id)))
        .all()

      for (const m of movs) {
        // Only reverse plant↔van load/unload
        if (
          (m.reason === 'load_to_van' || m.reason === 'unload_from_van') &&
          (m.fromLocation === 'plant' || m.fromLocation === 'van') &&
          (m.toLocation === 'plant' || m.toLocation === 'van')
        ) {
          stock.record(tx, {
            movementDate: existing.tripDate,
            productId: m.productId,
            bottleState: m.bottleState as 'filled' | 'empty',
            quantity: m.quantity,
            fromLocation: m.toLocation as 'plant' | 'van',
            toLocation: m.fromLocation as 'plant' | 'van',
            reason: m.reason === 'load_to_van' ? 'unload_from_van' : 'load_to_van',
            vehicleId: m.vehicleId,
            refTable: 'trips',
            refId: id,
            notes: `Void reversal: ${reason}`,
            createdBy: userId ?? null,
          })
        }
      }

      tx.update(trips)
        .set({
          status: 'void',
          notes: existing.notes ? `${existing.notes} [voided: ${reason}]` : `[voided: ${reason}]`,
          updatedAt: now,
        })
        .where(eq(trips.id, id))
        .run()

      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'trips',
          entityId: id,
          summary: `Voided trip #${id}: ${reason}`,
          before: existing,
        },
        tx,
      )
    })

    return getById(id)
  }

  function employeeVarianceSummary(from: string, to: string) {
    assertBusinessDate(from)
    assertBusinessDate(to)
    const rows = db
      .select({
        employeeId: trips.employeeId,
        employeeName: employees.name,
        tripsClosed: sql<number>`count(*)`,
        totalCashVariance: sql<number>`coalesce(sum(${trips.cashVariance}), 0)`,
        totalBottleVariance: sql<number>`coalesce(sum(${trips.bottleVariance}), 0)`,
      })
      .from(trips)
      .innerJoin(employees, eq(trips.employeeId, employees.id))
      .where(
        and(
          eq(trips.status, 'closed'),
          gte(trips.tripDate, from),
          lte(trips.tripDate, to),
          sql`${trips.employeeId} IS NOT NULL`,
        ),
      )
      .groupBy(trips.employeeId, employees.name)
      .all()

    return {
      items: rows
        .filter((r) => r.employeeId != null)
        .map((r) => ({
          employeeId: r.employeeId!,
          employeeName: r.employeeName,
          tripsClosed: Number(r.tripsClosed),
          totalCashVariance: Number(r.totalCashVariance),
          totalBottleVariance: Number(r.totalBottleVariance),
        })),
    }
  }

  /** Cash variance for an employee in a YYYY-MM period (for payroll performance). */
  function cashVarianceForEmployeePeriod(employeeId: number, periodKey: string): number | null {
    const rows = db
      .select({
        total: sql<number>`coalesce(sum(${trips.cashVariance}), 0)`,
        n: sql<number>`count(*)`,
      })
      .from(trips)
      .where(
        and(
          eq(trips.employeeId, employeeId),
          eq(trips.status, 'closed'),
          sql`substr(${trips.tripDate}, 1, 7) = ${periodKey}`,
        ),
      )
      .get()
    if (!rows || Number(rows.n) === 0) return null
    return Number(rows.total)
  }

  return {
    list,
    getById,
    getReconciliation,
    startTrip,
    closeTrip,
    voidTrip,
    findOpenTripForEmployeeDate,
    employeeVarianceSummary,
    cashVarianceForEmployeePeriod,
    linkedTotals,
  }
}

export type TripService = ReturnType<typeof createTripService>
