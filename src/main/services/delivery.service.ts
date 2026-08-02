import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import {
  areas,
  customerAdjustments,
  customerBalances,
  customerRates,
  customers,
  customerSchedules,
  deliveries,
  products,
  routes,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  BottlesOutOutput,
  CopyPreviousDayOutput,
  CustomerCardDayDto,
  DayListRowDto,
  DeliveryDto,
  DeliverySummaryInput,
  DeliverySummaryOutput,
  GetCustomerCardOutput,
  GetDayListOutput,
  GetMonthGridInput,
  GetMonthGridOutput,
  MissedDeliveriesOutput,
  MonthGridCellDto,
  MonthGridRowDto,
  RecordBottleLossInput,
  UpsertDeliveryInput,
  WalkInSaleInput,
} from '@shared/contracts'
import {
  assertBusinessDate,
  assertPeriod,
  formatDisplayDate,
  nowIsoUtc,
  periodEnd,
  periodFromDate,
  periodStart,
  todayBusinessDate,
  addBusinessDays,
} from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { PeriodService } from './period.service'
import type { RateService } from './rate.service'
import type { SettingsService } from './settings.service'
import type { StockService } from './stock.service'
import type { TripService } from './trip.service'

type DbLike = AppDatabase
type DeliveryRow = typeof deliveries.$inferSelect

const WALK_IN_CODE = 'WALK-IN'
/** Normal customer slot — one recorded row per (customer, date, product). */
const STANDARD_SLOT_KEY = ''

function computeAmount(opts: {
  quantity: number
  rate: number
  isFree: boolean
  billingMode: string
}): number {
  if (opts.isFree) return 0
  if (opts.billingMode === 'monthly_package') return 0
  return opts.quantity * opts.rate
}

/** True when the customer's schedule expects a delivery on `date`. */
export function scheduleMatchesDate(
  schedule: { mode: string; weekdays: string | null; intervalDays: number | null },
  date: string,
  lastDeliveryDate: string | null,
): boolean {
  if (schedule.mode === 'on_call') return false
  if (schedule.mode === 'weekdays') {
    // date-fns: Monday = 1 … Sunday = 7 (ISO)
    const d = new Date(`${date}T12:00:00`)
    const iso = d.getDay() === 0 ? 7 : d.getDay()
    const days = (schedule.weekdays ?? '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => n >= 1 && n <= 7)
    return days.includes(iso)
  }
  if (schedule.mode === 'interval_days') {
    const interval = schedule.intervalDays ?? 0
    if (interval <= 0) return false
    if (!lastDeliveryDate) return true
    const expected = addBusinessDays(lastDeliveryDate, interval)
    return date >= expected
  }
  return false
}

export function createDeliveryService(
  db: AppDatabase,
  audit: AuditService,
  period: PeriodService,
  rates: RateService,
  balances: BalanceService,
  settings?: Pick<SettingsService, 'get'>,
  stock?: StockService,
  trips?: TripService,
) {
  /** One query covering rates for many customers (avoids N× getRateFor). */
  function loadRateMap(
    customerIds: number[],
    productId: number,
    onDate: string,
  ): Map<number, number> {
    const map = new Map<number, number>()
    if (customerIds.length === 0) return map
    const product = db.select().from(products).where(eq(products.id, productId)).get()
    const defaultRate = product?.defaultRate ?? 0
    const openRates = db
      .select()
      .from(customerRates)
      .where(
        and(
          eq(customerRates.productId, productId),
          lte(customerRates.effectiveFrom, onDate),
          or(isNull(customerRates.effectiveTo), gte(customerRates.effectiveTo, onDate)),
        ),
      )
      .orderBy(desc(customerRates.effectiveFrom))
      .all()
    const wanted = new Set(customerIds)
    for (const r of openRates) {
      if (wanted.has(r.customerId) && !map.has(r.customerId)) {
        map.set(r.customerId, r.rate)
      }
    }
    for (const id of customerIds) {
      if (!map.has(id)) map.set(id, defaultRate)
    }
    return map
  }

  function toDto(
    row: DeliveryRow,
    extras?: { customerCode?: string; customerName?: string },
  ): DeliveryDto {
    const periodClosed = period.isClosed(periodFromDate(row.deliveryDate))
    const locked = row.invoiceId != null || periodClosed
    return {
      id: row.id,
      uuid: row.uuid,
      customerId: row.customerId,
      customerCode: extras?.customerCode,
      customerName: extras?.customerName,
      productId: row.productId,
      deliveryDate: row.deliveryDate,
      quantity: row.quantity,
      emptiesCollected: row.emptiesCollected,
      rate: row.rate,
      amount: row.amount,
      isFree: row.isFree === 1,
      freeReason: row.freeReason,
      employeeId: row.employeeId,
      tripId: row.tripId,
      cashCollected: row.cashCollected,
      notes: row.notes,
      status: row.status as 'recorded' | 'void',
      voidReason: row.voidReason,
      invoiceId: row.invoiceId,
      locked,
      periodClosed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    }
  }

  function getById(id: number): DeliveryDto {
    const row = db.select().from(deliveries).where(eq(deliveries.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', `Delivery ${id} not found`)
    const customer = db.select().from(customers).where(eq(customers.id, row.customerId)).get()
    return toDto(row, {
      customerCode: customer?.code,
      customerName: customer?.name,
    })
  }

  function findRecorded(
    customerId: number,
    date: string,
    productId: number,
    tx: DbLike = db,
  ): DeliveryRow | undefined {
    return tx
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.customerId, customerId),
          eq(deliveries.deliveryDate, date),
          eq(deliveries.productId, productId),
          eq(deliveries.slotKey, STANDARD_SLOT_KEY),
          eq(deliveries.status, 'recorded'),
        ),
      )
      .get()
  }

  function syncBottlesAndLastDelivery(customerId: number, tx: DbLike): void {
    const last = tx
      .select({ d: deliveries.deliveryDate })
      .from(deliveries)
      .where(and(eq(deliveries.customerId, customerId), eq(deliveries.status, 'recorded')))
      .orderBy(desc(deliveries.deliveryDate))
      .get()

    balances.upsertSummary(
      customerId,
      {
        balance: balances.computeLiveBalance(customerId, tx),
        bottlesWithCustomer: balances.computeLiveBottles(customerId, tx),
        lastDeliveryDate: last?.d ?? null,
      },
      tx,
    )
  }

  function upsertDelivery(input: UpsertDeliveryInput & { userId?: number | null }): DeliveryDto {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)

    const productId = rates.resolveDefaultProductId(input.productId)
    const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get()
    if (!customer || customer.deletedAt) {
      throw new AppError('NOT_FOUND', `Customer ${input.customerId} not found`)
    }

    const existing = findRecorded(input.customerId, input.date, productId)
    if (existing?.invoiceId != null) {
      throw new AppError(
        'DELIVERY_INVOICED',
        'This delivery is attached to an issued invoice and cannot be edited',
        { deliveryId: existing.id, invoiceId: existing.invoiceId },
      )
    }

    const isFree = input.isFree ?? (existing ? existing.isFree === 1 : false)
    const freeReason =
      input.freeReason !== undefined ? input.freeReason : existing ? existing.freeReason : null

    let rate: number
    let notes = input.notes !== undefined ? input.notes : (existing?.notes ?? null)

    if (existing) {
      if (input.rate !== undefined && input.rate !== existing.rate) {
        rate = input.rate
        const reason = input.rateOverrideReason?.trim() || 'rate overridden'
        const tag = `[rate_overridden: ${reason}]`
        notes = notes ? `${notes} ${tag}` : tag
      } else {
        rate = existing.rate
      }
    } else {
      rate =
        input.rate !== undefined
          ? input.rate
          : rates.getRateFor(input.customerId, productId, input.date)
      if (input.rate !== undefined && input.rateOverrideReason) {
        const tag = `[rate_overridden: ${input.rateOverrideReason.trim()}]`
        notes = notes ? `${notes} ${tag}` : tag
      }
    }

    const quantity = input.quantity
    const emptiesCollected =
      input.emptiesCollected !== undefined
        ? input.emptiesCollected
        : existing
          ? existing.emptiesCollected
          : quantity

    const amount = computeAmount({
      quantity,
      rate,
      isFree,
      billingMode: customer.billingMode,
    })

    const cashCollected =
      input.cashCollected !== undefined ? input.cashCollected : (existing?.cashCollected ?? 0)

    const employeeId =
      input.employeeId !== undefined ? input.employeeId : (existing?.employeeId ?? null)

    // Auto-link open trip for employee+date when trips are used (optional feature).
    const openTrip = trips?.findOpenTripForEmployeeDate(employeeId, input.date) ?? null
    const tripId = existing?.tripId ?? openTrip?.id ?? null
    const tripVehicleId = openTrip?.vehicleId ?? null

    // qty 0 + empties 0 ⇒ void; qty 0 + empties > 0 stays recorded (returns without delivery)
    const useStatus: 'recorded' | 'void' =
      quantity === 0 && emptiesCollected === 0 ? 'void' : 'recorded'
    const now = nowIsoUtc()
    const userId = input.userId ?? null

    const syncStock = (tx: DbLike, row: DeliveryRow): void => {
      stock?.syncDeliveryMovements(tx, row, {
        vehicleId: tripVehicleId,
        userId,
      })
    }

    const result = db.transaction((tx) => {
      if (existing) {
        const before = { ...existing }
        tx.update(deliveries)
          .set({
            quantity,
            emptiesCollected,
            rate,
            amount,
            isFree: isFree ? 1 : 0,
            freeReason: isFree ? freeReason : null,
            employeeId,
            tripId: existing.tripId ?? tripId,
            cashCollected,
            notes,
            status: useStatus,
            voidReason: useStatus === 'void' ? (existing.voidReason ?? 'cleared') : null,
            updatedAt: now,
            updatedBy: userId,
          })
          .where(eq(deliveries.id, existing.id))
          .run()

        const after = tx.select().from(deliveries).where(eq(deliveries.id, existing.id)).get()!
        audit.record(
          {
            userId,
            action: useStatus === 'void' ? 'void' : 'update',
            entityTable: 'deliveries',
            entityId: existing.id,
            summary:
              useStatus === 'void'
                ? `Voided delivery for ${customer.code} on ${input.date}`
                : `Updated delivery for ${customer.code} on ${input.date}: ${quantity} units`,
            before,
            after,
          },
          tx,
        )
        syncStock(tx, after)
        syncBottlesAndLastDelivery(input.customerId, tx)
        return after
      }

      // If a voided row exists for the same standard slot, revive it as an update
      const voided = tx
        .select()
        .from(deliveries)
        .where(
          and(
            eq(deliveries.customerId, input.customerId),
            eq(deliveries.deliveryDate, input.date),
            eq(deliveries.productId, productId),
            eq(deliveries.slotKey, STANDARD_SLOT_KEY),
            eq(deliveries.status, 'void'),
          ),
        )
        .orderBy(desc(deliveries.id))
        .get()

      if (voided) {
        if (voided.invoiceId != null) {
          throw new AppError(
            'DELIVERY_INVOICED',
            'This delivery is attached to an issued invoice and cannot be edited',
            { deliveryId: voided.id, invoiceId: voided.invoiceId },
          )
        }
        const before = { ...voided }
        tx.update(deliveries)
          .set({
            quantity,
            emptiesCollected,
            rate,
            amount,
            isFree: isFree ? 1 : 0,
            freeReason: isFree ? freeReason : null,
            employeeId,
            tripId: voided.tripId ?? tripId,
            cashCollected,
            notes,
            status: useStatus,
            voidReason: useStatus === 'void' ? 'cleared' : null,
            updatedAt: now,
            updatedBy: userId,
          })
          .where(eq(deliveries.id, voided.id))
          .run()
        const after = tx.select().from(deliveries).where(eq(deliveries.id, voided.id)).get()!
        audit.record(
          {
            userId,
            action: useStatus === 'void' ? 'void' : 'update',
            entityTable: 'deliveries',
            entityId: voided.id,
            summary: `Re-recorded delivery for ${customer.code} on ${input.date}: ${quantity} units`,
            before,
            after,
          },
          tx,
        )
        syncStock(tx, after)
        syncBottlesAndLastDelivery(input.customerId, tx)
        return after
      }

      if (useStatus === 'void') {
        // Nothing to insert — clearing a cell that never had a delivery
        return null
      }

      const inserted = tx
        .insert(deliveries)
        .values({
          uuid: newUuid(),
          customerId: input.customerId,
          productId,
          deliveryDate: input.date,
          quantity,
          emptiesCollected,
          rate,
          amount,
          isFree: isFree ? 1 : 0,
          freeReason: isFree ? freeReason : null,
          employeeId,
          tripId,
          cashCollected,
          notes,
          status: useStatus,
          voidReason: null,
          invoiceId: null,
          slotKey: STANDARD_SLOT_KEY,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()
        .get()

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'deliveries',
          entityId: inserted.id,
          summary: `Recorded delivery for ${customer.code} on ${input.date}: ${quantity} units`,
          after: inserted,
        },
        tx,
      )
      syncStock(tx, inserted)
      syncBottlesAndLastDelivery(input.customerId, tx)
      return inserted
    })

    if (!result) {
      // Synthetic void DTO for "clear empty cell"
      return {
        id: 0,
        uuid: '',
        customerId: input.customerId,
        productId,
        deliveryDate: input.date,
        quantity: 0,
        emptiesCollected: 0,
        rate,
        amount: 0,
        isFree: false,
        freeReason: null,
        employeeId: null,
        tripId: null,
        cashCollected: 0,
        notes: null,
        status: 'void',
        voidReason: 'cleared',
        invoiceId: null,
        locked: false,
        periodClosed: period.isClosed(periodFromDate(input.date)),
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      }
    }

    return toDto(result, { customerCode: customer.code, customerName: customer.name })
  }

  function voidDelivery(id: number, reason: string, userId?: number | null): DeliveryDto {
    const existing = db.select().from(deliveries).where(eq(deliveries.id, id)).get()
    if (!existing) throw new AppError('NOT_FOUND', `Delivery ${id} not found`)
    period.guardPeriodOpen(existing.deliveryDate)
    if (existing.invoiceId != null) {
      throw new AppError(
        'DELIVERY_INVOICED',
        'This delivery is attached to an issued invoice and cannot be edited',
        { deliveryId: existing.id, invoiceId: existing.invoiceId },
      )
    }
    if (existing.status === 'void') return toDto(existing)

    const now = nowIsoUtc()
    db.transaction((tx) => {
      tx.update(deliveries)
        .set({
          status: 'void',
          voidReason: reason,
          quantity: 0,
          emptiesCollected: 0,
          amount: 0,
          updatedAt: now,
          updatedBy: userId ?? null,
        })
        .where(eq(deliveries.id, id))
        .run()
      const after = tx.select().from(deliveries).where(eq(deliveries.id, id)).get()!
      audit.record(
        {
          userId,
          action: 'void',
          entityTable: 'deliveries',
          entityId: id,
          summary: `Voided delivery #${id}: ${reason}`,
          before: existing,
          after,
        },
        tx,
      )
      stock?.syncDeliveryMovements(tx, after, { userId })
      syncBottlesAndLastDelivery(existing.customerId, tx)
    })
    return getById(id)
  }

  function getDayList(filters: {
    date: string
    routeId?: number
    areaId?: number
    employeeId?: number
    search?: string
    status?: 'active' | 'paused' | 'inactive'
    productId?: number
  }): GetDayListOutput {
    assertBusinessDate(filters.date)
    const productId = rates.resolveDefaultProductId(filters.productId)
    const periodClosed = period.isClosed(periodFromDate(filters.date))

    const conditions = [isNull(customers.deletedAt), sql`${customers.customerType} != 'walk_in'`]
    if (filters.routeId) conditions.push(eq(customers.routeId, filters.routeId))
    if (filters.areaId) conditions.push(eq(customers.areaId, filters.areaId))
    if (filters.employeeId) {
      conditions.push(eq(routes.defaultEmployeeId, filters.employeeId))
    }
    if (filters.status) conditions.push(eq(customers.status, filters.status))
    else conditions.push(eq(customers.status, 'active'))
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`
      conditions.push(
        sql`(lower(${customers.name}) LIKE ${q} OR lower(${customers.code}) LIKE ${q})`,
      )
    }

    const custRows = db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        areaId: customers.areaId,
        routeId: customers.routeId,
        billingMode: customers.billingMode,
        phonePrimary: customers.phonePrimary,
        whatsappNumber: customers.whatsappNumber,
        areaName: areas.name,
        routeName: routes.name,
        routeSortOrder: routes.sortOrder,
      })
      .from(customers)
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .where(and(...conditions))
      .all()

    custRows.sort((a, b) => {
      const so = (a.routeSortOrder ?? 9999) - (b.routeSortOrder ?? 9999)
      if (so !== 0) return so
      const rn = (a.routeName ?? '').localeCompare(b.routeName ?? '')
      if (rn !== 0) return rn
      return a.name.localeCompare(b.name)
    })

    const deliveryRows = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.deliveryDate, filters.date),
          eq(deliveries.productId, productId),
          eq(deliveries.status, 'recorded'),
        ),
      )
      .all()
    const byCustomer = new Map(deliveryRows.map((d) => [d.customerId, d]))

    const balanceRows = db.select().from(customerBalances).all()
    const balMap = new Map(balanceRows.map((b) => [b.customerId, b]))

    const scheduleRows = db
      .select()
      .from(customerSchedules)
      .where(isNull(customerSchedules.deletedAt))
      .all()
    const schedMap = new Map(scheduleRows.map((s) => [s.customerId, s]))
    const rateMap = loadRateMap(
      custRows.map((c) => c.id),
      productId,
      filters.date,
    )

    const items: DayListRowDto[] = custRows.map((c) => {
      const d = byCustomer.get(c.id)
      const bal = balMap.get(c.id)
      const sched = schedMap.get(c.id)
      let suggestedQty: number | null = null
      if (sched && scheduleMatchesDate(sched, filters.date, bal?.lastDeliveryDate ?? null)) {
        suggestedQty = sched.defaultQty
      }
      const rate = rateMap.get(c.id) ?? 0
      return {
        customerId: c.id,
        code: c.code,
        name: c.name,
        areaId: c.areaId,
        areaName: c.areaName ?? null,
        routeId: c.routeId,
        routeName: c.routeName ?? null,
        routeSortOrder: c.routeSortOrder ?? 0,
        rate,
        billingMode: c.billingMode as 'per_bottle' | 'monthly_package',
        suggestedQty,
        deliveryId: d?.id ?? null,
        employeeId: d?.employeeId ?? null,
        quantity: d?.quantity ?? null,
        emptiesCollected: d?.emptiesCollected ?? null,
        amount: d?.amount ?? null,
        cashCollected: d?.cashCollected ?? null,
        notes: d?.notes ?? null,
        isFree: d ? d.isFree === 1 : false,
        locked: periodClosed || d?.invoiceId != null,
        periodClosed,
        bottlesWithCustomer: bal?.bottlesWithCustomer ?? 0,
        phonePrimary: c.phonePrimary,
        whatsappNumber: c.whatsappNumber,
      }
    })

    const served = items.filter(
      (i) => i.quantity != null && (i.quantity > 0 || (i.emptiesCollected ?? 0) > 0),
    )
    return {
      date: filters.date,
      periodClosed,
      items,
      totals: {
        customersServed: served.length,
        totalBottles: served.reduce((s, i) => s + (i.quantity ?? 0), 0),
        totalEmpties: served.reduce((s, i) => s + (i.emptiesCollected ?? 0), 0),
        totalAmount: served.reduce((s, i) => s + (i.amount ?? 0), 0),
        totalCash: served.reduce((s, i) => s + (i.cashCollected ?? 0), 0),
      },
    }
  }

  function getMonthGrid(input: GetMonthGridInput): GetMonthGridOutput {
    assertPeriod(input.period)
    const productId = rates.resolveDefaultProductId(input.productId)
    const start = periodStart(input.period)
    const end = periodEnd(input.period)
    const daysInMonth = Number(end.slice(8, 10))
    const periodClosed = period.isClosed(input.period)

    const conditions = [isNull(customers.deletedAt), sql`${customers.customerType} != 'walk_in'`]
    if (input.routeId) conditions.push(eq(customers.routeId, input.routeId))
    if (input.areaId) conditions.push(eq(customers.areaId, input.areaId))
    if (input.status) conditions.push(eq(customers.status, input.status))
    else conditions.push(sql`${customers.status} IN ('active','paused')`)
    if (input.search?.trim()) {
      const q = `%${input.search.trim().toLowerCase()}%`
      conditions.push(
        sql`(lower(${customers.name}) LIKE ${q} OR lower(${customers.code}) LIKE ${q})`,
      )
    }

    const custRows = db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        areaName: areas.name,
        routeName: routes.name,
        routeSortOrder: routes.sortOrder,
      })
      .from(customers)
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .where(and(...conditions))
      .all()

    custRows.sort((a, b) => {
      const so = (a.routeSortOrder ?? 9999) - (b.routeSortOrder ?? 9999)
      if (so !== 0) return so
      return a.name.localeCompare(b.name)
    })

    // Single query for the whole month
    const delRows = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.productId, productId),
          eq(deliveries.status, 'recorded'),
          gte(deliveries.deliveryDate, start),
          lte(deliveries.deliveryDate, end),
        ),
      )
      .all()

    const byCust = new Map<number, DeliveryRow[]>()
    for (const d of delRows) {
      const list = byCust.get(d.customerId) ?? []
      list.push(d)
      byCust.set(d.customerId, list)
    }

    const dayTotals = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      totalUnits: 0,
      totalAmount: 0,
    }))

    let grandTotalUnits = 0
    let grandTotalAmount = 0
    const rateMap = loadRateMap(
      custRows.map((c) => c.id),
      productId,
      start,
    )

    const rows: MonthGridRowDto[] = custRows.map((c) => {
      const dels = byCust.get(c.id) ?? []
      const cells: MonthGridCellDto[] = []
      let totalUnits = 0
      let totalAmount = 0
      let totalEmpties = 0
      for (const d of dels) {
        const day = Number(d.deliveryDate.slice(8, 10))
        cells.push({
          day,
          quantity: d.quantity,
          emptiesCollected: d.emptiesCollected,
          amount: d.amount,
          deliveryId: d.id,
          locked: periodClosed || d.invoiceId != null,
          hasNote: Boolean(d.notes),
          emptiesDiffer: d.emptiesCollected !== d.quantity,
        })
        totalUnits += d.quantity
        totalAmount += d.amount
        totalEmpties += d.emptiesCollected
        const dt = dayTotals[day - 1]!
        dt.totalUnits += d.quantity
        dt.totalAmount += d.amount
      }
      grandTotalUnits += totalUnits
      grandTotalAmount += totalAmount
      return {
        customerId: c.id,
        code: c.code,
        name: c.name,
        areaName: c.areaName ?? null,
        routeName: c.routeName ?? null,
        rate: rateMap.get(c.id) ?? 0,
        cells,
        totalUnits,
        totalAmount,
        totalEmpties,
      }
    })

    return {
      period: input.period,
      daysInMonth,
      periodClosed,
      rows,
      dayTotals,
      grandTotalUnits,
      grandTotalAmount,
    }
  }

  function getCustomerCard(input: {
    customerId: number
    period: string
    productId?: number
  }): GetCustomerCardOutput {
    assertPeriod(input.period)
    const productId = rates.resolveDefaultProductId(input.productId)
    const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get()
    if (!customer || customer.deletedAt) {
      throw new AppError('NOT_FOUND', `Customer ${input.customerId} not found`)
    }
    const start = periodStart(input.period)
    const end = periodEnd(input.period)
    const daysInMonth = Number(end.slice(8, 10))
    const periodClosed = period.isClosed(input.period)

    const delRows = db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.customerId, input.customerId),
          eq(deliveries.productId, productId),
          eq(deliveries.status, 'recorded'),
          gte(deliveries.deliveryDate, start),
          lte(deliveries.deliveryDate, end),
        ),
      )
      .all()
    const byDay = new Map(delRows.map((d) => [Number(d.deliveryDate.slice(8, 10)), d]))

    const days: CustomerCardDayDto[] = []
    let totalUnits = 0
    let totalAmount = 0
    let totalEmpties = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${input.period}-${String(day).padStart(2, '0')}`
      const d = byDay.get(day)
      if (d) {
        totalUnits += d.quantity
        totalAmount += d.amount
        totalEmpties += d.emptiesCollected
      }
      days.push({
        date,
        day,
        quantity: d?.quantity ?? null,
        emptiesCollected: d?.emptiesCollected ?? null,
        amount: d?.amount ?? null,
        deliveryId: d?.id ?? null,
        locked: periodClosed || d?.invoiceId != null,
        notes: d?.notes ?? null,
      })
    }

    const bal = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, input.customerId))
      .get()

    return {
      customerId: customer.id,
      code: customer.code,
      name: customer.name,
      period: input.period,
      rate: rates.getRateFor(customer.id, productId, start),
      periodClosed,
      days,
      totalUnits,
      totalAmount,
      totalEmpties,
      bottlesWithCustomer: bal?.bottlesWithCustomer ?? customer.openingBottles,
      lastDeliveryDate: bal?.lastDeliveryDate ?? null,
      balance: bal?.balance ?? 0,
    }
  }

  function getDeliverySummary(input: DeliverySummaryInput): DeliverySummaryOutput {
    assertBusinessDate(input.from)
    assertBusinessDate(input.to)

    const rows = db
      .select({
        deliveryDate: deliveries.deliveryDate,
        customerId: deliveries.customerId,
        quantity: deliveries.quantity,
        emptiesCollected: deliveries.emptiesCollected,
        amount: deliveries.amount,
        routeId: customers.routeId,
        areaId: customers.areaId,
        routeName: routes.name,
        areaName: areas.name,
        customerName: customers.name,
        customerCode: customers.code,
      })
      .from(deliveries)
      .innerJoin(customers, eq(deliveries.customerId, customers.id))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .where(
        and(
          eq(deliveries.status, 'recorded'),
          gte(deliveries.deliveryDate, input.from),
          lte(deliveries.deliveryDate, input.to),
          input.routeId ? eq(customers.routeId, input.routeId) : undefined,
          input.areaId ? eq(customers.areaId, input.areaId) : undefined,
        ),
      )
      .all()

    type Acc = {
      key: string
      label: string
      customers: Set<number>
      totalUnits: number
      totalEmpties: number
      totalAmount: number
    }
    const map = new Map<string, Acc>()

    for (const r of rows) {
      let key: string
      let label: string
      switch (input.groupBy) {
        case 'route':
          key = String(r.routeId ?? 0)
          label = r.routeName ?? 'No route'
          break
        case 'area':
          key = String(r.areaId ?? 0)
          label = r.areaName ?? 'No area'
          break
        case 'customer':
          key = String(r.customerId)
          label = `${r.customerCode} ${r.customerName}`
          break
        default:
          key = r.deliveryDate
          label = formatDisplayDate(r.deliveryDate)
      }
      let acc = map.get(key)
      if (!acc) {
        acc = {
          key,
          label,
          customers: new Set(),
          totalUnits: 0,
          totalEmpties: 0,
          totalAmount: 0,
        }
        map.set(key, acc)
      }
      acc.customers.add(r.customerId)
      acc.totalUnits += r.quantity
      acc.totalEmpties += r.emptiesCollected
      acc.totalAmount += r.amount
    }

    const items = [...map.values()]
      .map((a) => ({
        key: a.key,
        label: a.label,
        customersServed: a.customers.size,
        totalUnits: a.totalUnits,
        totalEmpties: a.totalEmpties,
        totalAmount: a.totalAmount,
      }))
      .sort((a, b) => a.key.localeCompare(b.key))

    return { items }
  }

  function copyFromPreviousDay(input: {
    date: string
    routeId?: number
    productId?: number
  }): CopyPreviousDayOutput {
    assertBusinessDate(input.date)
    const productId = rates.resolveDefaultProductId(input.productId)

    const sourceQuery = db
      .select({ d: deliveries.deliveryDate })
      .from(deliveries)
      .innerJoin(customers, eq(deliveries.customerId, customers.id))
      .where(
        and(
          eq(deliveries.status, 'recorded'),
          eq(deliveries.productId, productId),
          sql`${deliveries.deliveryDate} < ${input.date}`,
          input.routeId ? eq(customers.routeId, input.routeId) : undefined,
        ),
      )
      .orderBy(desc(deliveries.deliveryDate))
      .limit(1)
      .get()

    if (!sourceQuery) {
      return { sourceDate: null, items: [] }
    }

    const sourceDate = sourceQuery.d
    const rows = db
      .select({
        customerId: deliveries.customerId,
        quantity: deliveries.quantity,
        emptiesCollected: deliveries.emptiesCollected,
      })
      .from(deliveries)
      .innerJoin(customers, eq(deliveries.customerId, customers.id))
      .where(
        and(
          eq(deliveries.deliveryDate, sourceDate),
          eq(deliveries.status, 'recorded'),
          eq(deliveries.productId, productId),
          input.routeId ? eq(customers.routeId, input.routeId) : undefined,
        ),
      )
      .all()

    return {
      sourceDate,
      items: rows.map((r) => ({
        customerId: r.customerId,
        quantity: r.quantity,
        emptiesCollected: r.emptiesCollected,
      })),
    }
  }

  function getOrCreateWalkIn(userId?: number | null): number {
    const existing = db.select().from(customers).where(eq(customers.code, WALK_IN_CODE)).get()
    if (existing) return existing.id

    const now = nowIsoUtc()
    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()

    return db.transaction((tx) => {
      const inserted = tx
        .insert(customers)
        .values({
          uuid: newUuid(),
          code: WALK_IN_CODE,
          name: 'Walk-in / Cash sale',
          customerType: 'walk_in',
          billingMode: 'per_bottle',
          securityDepositHeld: 0,
          openingBottles: 0,
          openingBalance: 0,
          status: 'active',
          joinedOn: todayBusinessDate(),
          notes: 'System customer for walk-in cash sales — excluded from invoicing',
          createdAt: now,
          updatedAt: now,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        })
        .returning()
        .get()

      tx.insert(customerBalances)
        .values({
          customerId: inserted.id,
          balance: 0,
          bottlesWithCustomer: 0,
          updatedAt: now,
        })
        .run()

      if (product) {
        tx.insert(customerRates)
          .values({
            uuid: newUuid(),
            customerId: inserted.id,
            productId: product.id,
            rate: product.defaultRate || 6000,
            effectiveFrom: '2000-01-01',
            effectiveTo: null,
            reason: 'Walk-in default',
            createdAt: now,
            createdBy: userId ?? null,
          })
          .run()
      }

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'customers',
          entityId: inserted.id,
          summary: 'Auto-created WALK-IN system customer',
          after: inserted,
        },
        tx,
      )
      return inserted.id
    })
  }

  function walkInSale(input: WalkInSaleInput & { userId?: number | null }): DeliveryDto {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)

    const walkInId = getOrCreateWalkIn(input.userId)
    const productId = rates.resolveDefaultProductId()
    const product = db.select().from(products).where(eq(products.id, productId)).get()!
    const rate = input.rate ?? product.defaultRate
    const quantity = input.quantity
    const amount = quantity * rate
    const cashCollected = input.cashCollected ?? amount
    const noteParts = [
      'Walk-in sale',
      input.name ? `name=${input.name}` : null,
      input.phone ? `phone=${input.phone}` : null,
      input.rate !== undefined ? '[rate_overridden: walk-in rate]' : null,
      input.notes,
    ].filter(Boolean)
    const now = nowIsoUtc()
    const userId = input.userId ?? null
    // Unique slot per sale — never upsert/overwrite an earlier same-day walk-in.
    const slotKey = newUuid()

    const inserted = db.transaction((tx) => {
      const row = tx
        .insert(deliveries)
        .values({
          uuid: newUuid(),
          customerId: walkInId,
          productId,
          deliveryDate: input.date,
          quantity,
          emptiesCollected: 0,
          rate,
          amount,
          isFree: 0,
          freeReason: null,
          employeeId: null,
          tripId: null,
          cashCollected,
          notes: noteParts.join('; '),
          status: 'recorded',
          voidReason: null,
          invoiceId: null,
          slotKey,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()
        .get()

      audit.record(
        {
          userId,
          action: 'create',
          entityTable: 'deliveries',
          entityId: row.id,
          summary: `Walk-in sale on ${input.date}: ${quantity} units @ ${rate}`,
          after: row,
        },
        tx,
      )
      stock?.syncDeliveryMovements(tx, row, { userId })
      syncBottlesAndLastDelivery(walkInId, tx)
      return row
    })

    return toDto(inserted, {
      customerCode: WALK_IN_CODE,
      customerName: 'Walk-in / Cash sale',
    })
  }

  function listBottlesOut(input: {
    search?: string
    routeId?: number
    areaId?: number
    minBottles?: number
  }): BottlesOutOutput {
    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()
    const defaultDeposit = product?.defaultDeposit ?? 0
    const today = todayBusinessDate()
    const min = input.minBottles ?? 1

    const conditions = [
      isNull(customers.deletedAt),
      sql`${customers.customerType} != 'walk_in'`,
      gte(customerBalances.bottlesWithCustomer, min),
    ]
    if (input.routeId) conditions.push(eq(customers.routeId, input.routeId))
    if (input.areaId) conditions.push(eq(customers.areaId, input.areaId))
    if (input.search?.trim()) {
      const q = `%${input.search.trim().toLowerCase()}%`
      conditions.push(
        sql`(lower(${customers.name}) LIKE ${q} OR lower(${customers.code}) LIKE ${q})`,
      )
    }

    const rows = db
      .select({
        customerId: customers.id,
        code: customers.code,
        name: customers.name,
        phonePrimary: customers.phonePrimary,
        whatsappNumber: customers.whatsappNumber,
        areaName: areas.name,
        routeName: routes.name,
        bottlesWithCustomer: customerBalances.bottlesWithCustomer,
        securityDepositHeld: customers.securityDepositHeld,
        lastDeliveryDate: customerBalances.lastDeliveryDate,
      })
      .from(customers)
      .innerJoin(customerBalances, eq(customers.id, customerBalances.customerId))
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .where(and(...conditions))
      .orderBy(desc(customerBalances.bottlesWithCustomer))
      .all()

    const lastReturnRows = db
      .select({
        customerId: deliveries.customerId,
        lastReturnDate: sql<string>`max(${deliveries.deliveryDate})`,
      })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'recorded'), sql`${deliveries.emptiesCollected} > 0`))
      .groupBy(deliveries.customerId)
      .all()
    const lastReturnMap = new Map(
      lastReturnRows
        .filter((r) => r.lastReturnDate)
        .map((r) => [r.customerId, r.lastReturnDate as string]),
    )

    return {
      items: rows.map((r) => {
        let daysSinceLastReturn: number | null = null
        const lastReturn = lastReturnMap.get(r.customerId)
        if (lastReturn) {
          const a = new Date(`${lastReturn}T12:00:00`).getTime()
          const b = new Date(`${today}T12:00:00`).getTime()
          daysSinceLastReturn = Math.max(0, Math.round((b - a) / 86_400_000))
        }
        const depositCovered =
          defaultDeposit > 0
            ? r.bottlesWithCustomer * defaultDeposit > r.securityDepositHeld
            : false
        return {
          customerId: r.customerId,
          code: r.code,
          name: r.name,
          phonePrimary: r.phonePrimary,
          whatsappNumber: r.whatsappNumber,
          areaName: r.areaName ?? null,
          routeName: r.routeName ?? null,
          bottlesWithCustomer: r.bottlesWithCustomer,
          securityDepositHeld: r.securityDepositHeld,
          defaultDeposit,
          depositShortfall: depositCovered,
          lastDeliveryDate: r.lastDeliveryDate,
          daysSinceLastReturn,
        }
      }),
    }
  }

  function listMissedDeliveries(input: {
    asOf?: string
    thresholdDays?: number
    routeId?: number
  }): MissedDeliveriesOutput {
    const asOf = input.asOf ?? todayBusinessDate()
    assertBusinessDate(asOf)
    const threshold = input.thresholdDays ?? settings?.get('deliveries.missedDaysThreshold') ?? 10
    const cutoff = addBusinessDays(asOf, -threshold)

    const conditions = [
      isNull(customers.deletedAt),
      eq(customers.status, 'active'),
      sql`${customers.customerType} != 'walk_in'`,
    ]
    if (input.routeId) conditions.push(eq(customers.routeId, input.routeId))

    const rows = db
      .select({
        customerId: customers.id,
        code: customers.code,
        name: customers.name,
        phonePrimary: customers.phonePrimary,
        whatsappNumber: customers.whatsappNumber,
        routeName: routes.name,
        lastDeliveryDate: customerBalances.lastDeliveryDate,
        scheduleMode: customerSchedules.mode,
        weekdays: customerSchedules.weekdays,
        intervalDays: customerSchedules.intervalDays,
      })
      .from(customers)
      .leftJoin(customerBalances, eq(customers.id, customerBalances.customerId))
      .leftJoin(routes, eq(customers.routeId, routes.id))
      .leftJoin(
        customerSchedules,
        and(eq(customerSchedules.customerId, customers.id), isNull(customerSchedules.deletedAt)),
      )
      .where(and(...conditions))
      .all()

    const items: MissedDeliveriesOutput['items'] = []
    for (const r of rows) {
      const last = r.lastDeliveryDate
      const daysSince = last
        ? Math.round(
            (new Date(`${asOf}T12:00:00`).getTime() - new Date(`${last}T12:00:00`).getTime()) /
              86_400_000,
          )
        : null

      let reason: 'schedule_overdue' | 'no_delivery_n_days' | null = null
      if (r.scheduleMode && r.scheduleMode !== 'on_call') {
        if (
          scheduleMatchesDate(
            { mode: r.scheduleMode, weekdays: r.weekdays, intervalDays: r.intervalDays },
            asOf,
            last,
          ) &&
          (!last || last < asOf)
        ) {
          // overdue relative to schedule
          if (r.scheduleMode === 'interval_days' && r.intervalDays && last) {
            const expected = addBusinessDays(last, r.intervalDays)
            if (asOf > expected) reason = 'schedule_overdue'
          } else if (r.scheduleMode === 'weekdays') {
            if (!last || last < cutoff) reason = 'schedule_overdue'
          }
        }
      }
      if (!reason && (!last || last < cutoff)) {
        reason = 'no_delivery_n_days'
      }
      if (reason) {
        items.push({
          customerId: r.customerId,
          code: r.code,
          name: r.name,
          phonePrimary: r.phonePrimary,
          whatsappNumber: r.whatsappNumber,
          routeName: r.routeName ?? null,
          lastDeliveryDate: last,
          daysSince,
          reason,
        })
      }
    }

    items.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
    return { items: items.slice(0, 100) }
  }

  function recordBottleLoss(input: RecordBottleLossInput & { userId?: number | null }): {
    id: number
    bottlesWithCustomer: number
  } {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get()
    if (!customer || customer.deletedAt) {
      throw new AppError('NOT_FOUND', `Customer ${input.customerId} not found`)
    }
    const productId = rates.resolveDefaultProductId()
    const rate = rates.getRateFor(input.customerId, productId, input.date)
    const amount = input.amount ?? rate * input.quantity
    const now = nowIsoUtc()

    const id = db.transaction((tx) => {
      const row = tx
        .insert(customerAdjustments)
        .values({
          uuid: newUuid(),
          customerId: input.customerId,
          adjustmentDate: input.date,
          kind: input.kind,
          amount,
          quantity: input.quantity,
          description:
            input.description ??
            `${input.kind === 'lost_bottle' ? 'Lost' : 'Damaged'} bottle × ${input.quantity}`,
          invoiceId: null,
          status: 'active',
          createdAt: now,
          createdBy: input.userId ?? null,
        })
        .returning()
        .get()

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'customer_adjustments',
          entityId: row.id,
          summary: `Recorded ${input.kind} × ${input.quantity} for ${customer.code}`,
          after: row,
        },
        tx,
      )
      stock?.writeAdjustmentScrapMovement(tx, {
        adjustmentId: row.id,
        customerId: input.customerId,
        date: input.date,
        quantity: input.quantity,
        kind: input.kind,
        productId,
        userId: input.userId,
      })
      syncBottlesAndLastDelivery(input.customerId, tx)
      return row.id
    })

    const bottles = balances.computeLiveBottles(input.customerId)
    return { id, bottlesWithCustomer: bottles }
  }

  function exportMonthGrid(input: GetMonthGridInput & { format: 'csv' | 'xlsx' }): {
    fileName: string
    mimeType: string
    base64: string
  } {
    const grid = getMonthGrid(input)
    const headers = [
      'Code',
      'Name',
      'Route',
      ...Array.from({ length: grid.daysInMonth }, (_, i) => String(i + 1)),
      'Total units',
      'Total amount (paisa)',
    ]
    const dataRows = grid.rows.map((r) => {
      const byDay = new Map(r.cells.map((c) => [c.day, c.quantity]))
      return [
        r.code,
        r.name,
        r.routeName ?? '',
        ...Array.from({ length: grid.daysInMonth }, (_, i) => {
          const q = byDay.get(i + 1)
          return q == null ? '' : String(q)
        }),
        String(r.totalUnits),
        String(r.totalAmount),
      ]
    })

    if (input.format === 'csv') {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
      const csv = [headers, ...dataRows].map((row) => row.map(escape).join(',')).join('\n')
      return {
        fileName: `deliveries-${input.period}.csv`,
        mimeType: 'text/csv',
        base64: Buffer.from(csv, 'utf8').toString('base64'),
      }
    }

    // xlsx via existing dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx')
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, input.period)
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return {
      fileName: `deliveries-${input.period}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buf.toString('base64'),
    }
  }

  function todaySummary(date = todayBusinessDate()): {
    customersServed: number
    totalBottles: number
    totalAmount: number
  } {
    const list = getDayList({ date })
    return {
      customersServed: list.totals.customersServed,
      totalBottles: list.totals.totalBottles,
      totalAmount: list.totals.totalAmount,
    }
  }

  return {
    upsertDelivery,
    voidDelivery,
    getById,
    getDayList,
    getMonthGrid,
    getCustomerCard,
    getDeliverySummary,
    copyFromPreviousDay,
    walkInSale,
    listBottlesOut,
    listMissedDeliveries,
    recordBottleLoss,
    exportMonthGrid,
    todaySummary,
    getOrCreateWalkIn,
  }
}

export type DeliveryService = ReturnType<typeof createDeliveryService>
