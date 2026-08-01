import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import {
  areas,
  customerAdjustments,
  customerBalances,
  customers,
  deliveries,
  products,
  routes,
  stockMovements,
  vehicles,
} from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type {
  GetStockBalancesOutput,
  InventoryBottlesOutOutput,
  PurchaseBottlesInput,
  RecordAdjustmentInput,
  RecordDamageInput,
  RecordOpeningStockInput,
  RecordProductionInput,
  StockBalanceDto,
  StockMovementDto,
} from '@shared/contracts'
import { assertBusinessDate, addBusinessDays, nowIsoUtc, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { BalanceService } from './balance.service'
import type { ExpenseService } from './expense.service'
import type { PeriodService } from './period.service'
import type { RateService } from './rate.service'
import type { SettingsService } from './settings.service'

type DbLike = AppDatabase

export type StockLocationFrom = 'none' | 'plant' | 'van' | 'customer' | 'supplier'
export type StockLocationTo = 'none' | 'plant' | 'van' | 'customer' | 'scrap'
export type BottleState = 'filled' | 'empty'
export type StockReason =
  | 'purchase'
  | 'production'
  | 'load_to_van'
  | 'unload_from_van'
  | 'delivery'
  | 'empty_pickup'
  | 'damaged'
  | 'lost'
  | 'scrapped'
  | 'adjustment'
  | 'opening_stock'

export type RecordMovementInput = {
  movementDate: string
  productId: number
  bottleState: BottleState
  quantity: number
  fromLocation: StockLocationFrom
  toLocation: StockLocationTo
  reason: StockReason
  vehicleId?: number | null
  customerId?: number | null
  refTable?: string | null
  refId?: number | null
  notes?: string | null
  createdBy?: number | null
}

/**
 * Stock movement engine. `record` is the only way rows enter stock_movements.
 * Balances are always derived — never stored as a mutable counter.
 */
export function createStockService(
  db: AppDatabase,
  raw: RawDatabase,
  audit: AuditService,
  period: PeriodService,
  rates: RateService,
  settings: Pick<SettingsService, 'get'>,
  expenses: ExpenseService,
  balances: BalanceService,
) {
  function resolveProductId(productId?: number): number {
    return rates.resolveDefaultProductId(productId)
  }

  function toDto(
    row: typeof stockMovements.$inferSelect,
    extras?: Partial<StockMovementDto>,
  ): StockMovementDto {
    return {
      id: row.id,
      uuid: row.uuid,
      movementDate: row.movementDate,
      productId: row.productId,
      productName: extras?.productName,
      bottleState: row.bottleState as BottleState,
      quantity: row.quantity,
      fromLocation: row.fromLocation as StockLocationFrom,
      toLocation: row.toLocation as StockLocationTo,
      vehicleId: row.vehicleId,
      vehicleName: extras?.vehicleName ?? null,
      customerId: row.customerId,
      customerName: extras?.customerName ?? null,
      reason: row.reason as StockReason,
      refTable: row.refTable,
      refId: row.refId,
      notes: row.notes,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      balanceAfterOwned: extras?.balanceAfterOwned,
    }
  }

  /** The only writer for stock_movements. */
  function record(tx: DbLike, input: RecordMovementInput): typeof stockMovements.$inferSelect {
    if (input.quantity <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Stock movement quantity must be > 0')
    }
    assertBusinessDate(input.movementDate)
    const now = nowIsoUtc()
    const row = tx
      .insert(stockMovements)
      .values({
        uuid: newUuid(),
        movementDate: input.movementDate,
        productId: input.productId,
        bottleState: input.bottleState,
        quantity: input.quantity,
        fromLocation: input.fromLocation,
        toLocation: input.toLocation,
        vehicleId: input.vehicleId ?? null,
        customerId: input.customerId ?? null,
        reason: input.reason,
        refTable: input.refTable ?? null,
        refId: input.refId ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        createdBy: input.createdBy ?? null,
      })
      .returning()
      .get()
    return row
  }

  /**
   * Delivery sync strategy: **reversal-by-replace**.
   * Delete prior movements for this delivery ref, then write movements matching
   * the current recorded state. Easier to reason about than deltas; non-delivery
   * events (purchase, production, trips) remain strictly append-only.
   */
  function clearDeliveryMovements(tx: DbLike, deliveryId: number): void {
    tx.delete(stockMovements)
      .where(and(eq(stockMovements.refTable, 'deliveries'), eq(stockMovements.refId, deliveryId)))
      .run()
  }

  function writeDeliveryMovements(
    tx: DbLike,
    opts: {
      deliveryId: number
      deliveryDate: string
      productId: number
      customerId: number
      quantity: number
      emptiesCollected: number
      /** When linked to an open/closed trip, stock moves via van; otherwise plant. */
      viaVan: boolean
      vehicleId?: number | null
      userId?: number | null
    },
  ): void {
    clearDeliveryMovements(tx, opts.deliveryId)
    const fromFilled: StockLocationFrom = opts.viaVan ? 'van' : 'plant'
    const toEmpty: StockLocationTo = opts.viaVan ? 'van' : 'plant'
    if (opts.quantity > 0) {
      record(tx, {
        movementDate: opts.deliveryDate,
        productId: opts.productId,
        bottleState: 'filled',
        quantity: opts.quantity,
        fromLocation: fromFilled,
        toLocation: 'customer',
        reason: 'delivery',
        vehicleId: opts.viaVan ? (opts.vehicleId ?? null) : null,
        customerId: opts.customerId,
        refTable: 'deliveries',
        refId: opts.deliveryId,
        createdBy: opts.userId ?? null,
      })
    }
    if (opts.emptiesCollected > 0) {
      record(tx, {
        movementDate: opts.deliveryDate,
        productId: opts.productId,
        bottleState: 'empty',
        quantity: opts.emptiesCollected,
        fromLocation: 'customer',
        toLocation: toEmpty,
        reason: 'empty_pickup',
        vehicleId: opts.viaVan ? (opts.vehicleId ?? null) : null,
        customerId: opts.customerId,
        refTable: 'deliveries',
        refId: opts.deliveryId,
        createdBy: opts.userId ?? null,
      })
    }
  }

  function syncDeliveryMovements(
    tx: DbLike,
    delivery: {
      id: number
      deliveryDate: string
      productId: number
      customerId: number
      quantity: number
      emptiesCollected: number
      status: string
      tripId: number | null
    },
    opts?: { vehicleId?: number | null; userId?: number | null },
  ): void {
    if (delivery.status !== 'recorded') {
      clearDeliveryMovements(tx, delivery.id)
      return
    }
    writeDeliveryMovements(tx, {
      deliveryId: delivery.id,
      deliveryDate: delivery.deliveryDate,
      productId: delivery.productId,
      customerId: delivery.customerId,
      quantity: delivery.quantity,
      emptiesCollected: delivery.emptiesCollected,
      viaVan: delivery.tripId != null,
      vehicleId: opts?.vehicleId ?? null,
      userId: opts?.userId ?? null,
    })
  }

  function writeCustomerOpeningMovement(
    tx: DbLike,
    opts: {
      customerId: number
      openingBottles: number
      date: string
      productId?: number
      userId?: number | null
    },
  ): void {
    // Replace any prior opening movement for this customer
    tx.delete(stockMovements)
      .where(
        and(
          eq(stockMovements.refTable, 'customers'),
          eq(stockMovements.refId, opts.customerId),
          eq(stockMovements.reason, 'opening_stock'),
        ),
      )
      .run()
    if (opts.openingBottles <= 0) return
    record(tx, {
      movementDate: opts.date,
      productId: resolveProductId(opts.productId),
      bottleState: 'filled',
      quantity: opts.openingBottles,
      fromLocation: 'none',
      toLocation: 'customer',
      reason: 'opening_stock',
      customerId: opts.customerId,
      refTable: 'customers',
      refId: opts.customerId,
      notes: 'Opening bottles with customer',
      createdBy: opts.userId ?? null,
    })
  }

  function writeAdjustmentScrapMovement(
    tx: DbLike,
    opts: {
      adjustmentId: number
      customerId: number
      date: string
      quantity: number
      kind: 'lost_bottle' | 'damaged_bottle'
      productId?: number
      userId?: number | null
    },
  ): void {
    const reason: StockReason = opts.kind === 'lost_bottle' ? 'lost' : 'damaged'
    tx.delete(stockMovements)
      .where(
        and(
          eq(stockMovements.refTable, 'customer_adjustments'),
          eq(stockMovements.refId, opts.adjustmentId),
        ),
      )
      .run()
    if (opts.quantity <= 0) return
    record(tx, {
      movementDate: opts.date,
      productId: resolveProductId(opts.productId),
      bottleState: 'filled',
      quantity: opts.quantity,
      fromLocation: 'customer',
      toLocation: 'scrap',
      reason,
      customerId: opts.customerId,
      refTable: 'customer_adjustments',
      refId: opts.adjustmentId,
      createdBy: opts.userId ?? null,
    })
  }

  function getBalances(asOf?: string, productId?: number): GetStockBalancesOutput {
    if (asOf) assertBusinessDate(asOf)
    const pid = productId ? resolveProductId(productId) : null

    const productRows = db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(
          sql`${products.deletedAt} IS NULL`,
          eq(products.trackStock, 1),
          pid ? eq(products.id, pid) : undefined,
        ),
      )
      .all()

    // Single grouped query: net qty per (product, state, location bucket)
    const params: Array<string | number> = []
    let dateClause = ''
    let productClause = ''
    if (asOf) {
      dateClause = ' AND movement_date <= ?'
      params.push(asOf)
    }
    if (pid) {
      productClause = ' AND product_id = ?'
      params.push(pid)
    }
    // Params appear twice (in + out legs)
    const allParams = [...params, ...params]
    const rows = raw
      .prepare(
        `SELECT product_id, bottle_state, location, SUM(qty) AS net FROM (
          SELECT product_id, bottle_state, to_location AS location, quantity AS qty
          FROM stock_movements
          WHERE 1=1${dateClause}${productClause}
          UNION ALL
          SELECT product_id, bottle_state, from_location AS location, -quantity AS qty
          FROM stock_movements
          WHERE 1=1${dateClause}${productClause}
            AND from_location NOT IN ('none','supplier')
        )
        GROUP BY product_id, bottle_state, location`,
      )
      .all(...allParams) as Array<{
      product_id: number
      bottle_state: string
      location: string
      net: number
    }>

    const byProduct = new Map<number, StockBalanceDto>()
    for (const p of productRows) {
      byProduct.set(p.id, {
        productId: p.id,
        productName: p.name,
        filledAtPlant: 0,
        emptyAtPlant: 0,
        filledInVans: 0,
        emptyInVans: 0,
        withCustomers: 0,
        scrapped: 0,
        totalOwned: 0,
      })
    }

    for (const r of rows) {
      const bal = byProduct.get(r.product_id)
      if (!bal) continue
      const net = Number(r.net) || 0
      if (r.location === 'plant' && r.bottle_state === 'filled') bal.filledAtPlant += net
      else if (r.location === 'plant' && r.bottle_state === 'empty') bal.emptyAtPlant += net
      else if (r.location === 'van' && r.bottle_state === 'filled') bal.filledInVans += net
      else if (r.location === 'van' && r.bottle_state === 'empty') bal.emptyInVans += net
      else if (r.location === 'customer') bal.withCustomers += net
      else if (r.location === 'scrap') bal.scrapped += net
    }

    const items = [...byProduct.values()].map((b) => {
      b.totalOwned =
        b.filledAtPlant + b.emptyAtPlant + b.filledInVans + b.emptyInVans + b.withCustomers
      return b
    })

    const totals = items.reduce(
      (acc, b) => ({
        filledAtPlant: acc.filledAtPlant + b.filledAtPlant,
        emptyAtPlant: acc.emptyAtPlant + b.emptyAtPlant,
        filledInVans: acc.filledInVans + b.filledInVans,
        emptyInVans: acc.emptyInVans + b.emptyInVans,
        withCustomers: acc.withCustomers + b.withCustomers,
        scrapped: acc.scrapped + b.scrapped,
        totalOwned: acc.totalOwned + b.totalOwned,
      }),
      {
        filledAtPlant: 0,
        emptyAtPlant: 0,
        filledInVans: 0,
        emptyInVans: 0,
        withCustomers: 0,
        scrapped: 0,
        totalOwned: 0,
      },
    )

    const threshold = settings.get('inventory.lowStockThreshold') ?? 0
    const asOfDate = asOf ?? todayBusinessDate()
    const from14 = addBusinessDays(asOfDate, -13)
    const consumed = db
      .select({
        total: sql<number>`coalesce(sum(${deliveries.quantity}), 0)`,
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.status, 'recorded'),
          gte(deliveries.deliveryDate, from14),
          lte(deliveries.deliveryDate, asOfDate),
        ),
      )
      .get()
    const avgDaily = Number(consumed?.total ?? 0) / 14
    const filled = totals.filledAtPlant
    const daysLeft = avgDaily > 0 ? filled / avgDaily : null

    return {
      items,
      totals,
      lowStock: {
        threshold,
        filledAtPlant: filled,
        isLow: threshold > 0 && filled < threshold,
        avgDailyConsumption14d: Math.round(avgDaily * 100) / 100,
        daysOfStockLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
      },
    }
  }

  function listMovements(input: {
    from?: string
    to?: string
    productId?: number
    reason?: StockReason
    location?: string
    vehicleId?: number
    customerId?: number
    limit?: number
  }): { items: StockMovementDto[] } {
    const conditions = []
    if (input.from) {
      assertBusinessDate(input.from)
      conditions.push(gte(stockMovements.movementDate, input.from))
    }
    if (input.to) {
      assertBusinessDate(input.to)
      conditions.push(lte(stockMovements.movementDate, input.to))
    }
    if (input.productId) conditions.push(eq(stockMovements.productId, input.productId))
    if (input.reason) conditions.push(eq(stockMovements.reason, input.reason))
    if (input.vehicleId) conditions.push(eq(stockMovements.vehicleId, input.vehicleId))
    if (input.customerId) conditions.push(eq(stockMovements.customerId, input.customerId))
    if (input.location) {
      conditions.push(
        or(
          eq(stockMovements.fromLocation, input.location),
          eq(stockMovements.toLocation, input.location),
        ),
      )
    }

    const rows = db
      .select({
        m: stockMovements,
        productName: products.name,
        vehicleName: vehicles.name,
        customerName: customers.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(vehicles, eq(stockMovements.vehicleId, vehicles.id))
      .leftJoin(customers, eq(stockMovements.customerId, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(stockMovements.movementDate), desc(stockMovements.id))
      .limit(input.limit ?? 500)
      .all()

    // Running totalOwned chronologically for the filtered set (oldest→newest then reverse)
    const chrono = [...rows].reverse()
    let owned = 0
    const afterMap = new Map<number, number>()
    for (const r of chrono) {
      const m = r.m
      const intoOwned =
        (m.toLocation === 'plant' || m.toLocation === 'van' || m.toLocation === 'customer'
          ? m.quantity
          : 0) -
        (m.fromLocation === 'plant' || m.fromLocation === 'van' || m.fromLocation === 'customer'
          ? m.quantity
          : 0)
      // Production: empty plant→none and filled none→plant net 0; purchase supplier→plant +qty
      // supplier/none from don't subtract from owned; scrap to subtracts (to not in owned)
      owned += intoOwned
      afterMap.set(m.id, owned)
    }

    return {
      items: rows.map((r) =>
        toDto(r.m, {
          productName: r.productName,
          vehicleName: r.vehicleName ?? null,
          customerName: r.customerName ?? null,
          balanceAfterOwned: afterMap.get(r.m.id),
        }),
      ),
    }
  }

  function recordOpeningStock(
    input: RecordOpeningStockInput & { userId?: number | null },
  ): StockMovementDto {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const productId = resolveProductId(input.productId)

    // Opening stock is allowed per product until any non-opening movement exists.
    const nonOpening = db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.productId, productId),
          sql`${stockMovements.reason} != 'opening_stock'`,
        ),
      )
      .limit(1)
      .get()

    if (nonOpening && !input.forceAdjustment) {
      throw new AppError(
        'CONFLICT',
        'Opening stock is only allowed until other movements exist for this product. Use a manual adjustment instead.',
      )
    }

    const reason: StockReason = nonOpening ? 'adjustment' : 'opening_stock'
    const now = nowIsoUtc()
    const row = db.transaction((tx) => {
      const m = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: input.bottleState,
        quantity: input.quantity,
        fromLocation: 'none',
        toLocation: 'plant',
        reason,
        notes: input.notes ?? (reason === 'opening_stock' ? 'Opening stock' : input.notes),
        createdBy: input.userId ?? null,
      })
      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'stock_movements',
          entityId: m.id,
          summary: `${reason === 'opening_stock' ? 'Opening stock' : 'Adjustment'}: ${input.quantity} ${input.bottleState} at plant`,
          after: m,
        },
        tx,
      )
      return m
    })
    void now
    const product = db.select().from(products).where(eq(products.id, productId)).get()
    return toDto(row, { productName: product?.name })
  }

  function purchaseBottles(input: PurchaseBottlesInput & { userId: number }): {
    movement: StockMovementDto
    expenseId: number
    expenseAmount: number
  } {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const productId = resolveProductId(input.productId)
    const amount = input.quantity * input.unitCost
    if (amount <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Purchase amount must be > 0')
    }
    const cat = expenses.findCategoryByName('Bottle purchase')
    if (!cat) {
      throw new AppError('NOT_FOUND', 'Bottle purchase expense category not found')
    }

    const result = db.transaction((tx) => {
      const m = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: 'empty',
        quantity: input.quantity,
        fromLocation: 'supplier',
        toLocation: 'plant',
        reason: 'purchase',
        notes: input.notes ?? null,
        createdBy: input.userId,
      })

      const exp = expenses.createExpense(
        {
          expenseDate: input.date,
          categoryId: cat.id,
          amount,
          paymentMethod: input.paymentMethod ?? 'cash',
          vendorName: input.vendorName ?? null,
          description: `Bottle purchase × ${input.quantity}`,
          source: 'purchase',
          sourceRefTable: 'stock_movements',
          sourceRefId: m.id,
        },
        input.userId,
        tx,
      )

      // Link movement ref to itself for traceability
      tx.update(stockMovements)
        .set({ refTable: 'stock_movements', refId: m.id })
        .where(eq(stockMovements.id, m.id))
        .run()

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'stock_movements',
          entityId: m.id,
          summary: `Purchased ${input.quantity} bottles (expense #${exp.id})`,
          after: m,
        },
        tx,
      )
      return { m, expenseId: exp.id, expenseAmount: amount }
    })

    const product = db.select().from(products).where(eq(products.id, productId)).get()
    return {
      movement: toDto(result.m, { productName: product?.name }),
      expenseId: result.expenseId,
      expenseAmount: result.expenseAmount,
    }
  }

  function recordProduction(input: RecordProductionInput & { userId?: number | null }): {
    emptyOut: StockMovementDto
    filledIn: StockMovementDto
  } {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const productId = resolveProductId(input.productId)
    const noteParts = [
      input.shift ? `shift=${input.shift}` : null,
      input.operatorEmployeeId ? `operator=#${input.operatorEmployeeId}` : null,
      input.notes,
    ].filter(Boolean)

    const result = db.transaction((tx) => {
      // empty: plant → none (production); filled: none → plant (production)
      const emptyOut = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: 'empty',
        quantity: input.quantity,
        fromLocation: 'plant',
        toLocation: 'none',
        reason: 'production',
        notes: noteParts.join('; ') || null,
        createdBy: input.userId ?? null,
      })
      const filledIn = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: 'filled',
        quantity: input.quantity,
        fromLocation: 'none',
        toLocation: 'plant',
        reason: 'production',
        refTable: 'stock_movements',
        refId: emptyOut.id,
        notes: noteParts.join('; ') || null,
        createdBy: input.userId ?? null,
      })
      tx.update(stockMovements)
        .set({ refTable: 'stock_movements', refId: filledIn.id })
        .where(eq(stockMovements.id, emptyOut.id))
        .run()

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'stock_movements',
          entityId: filledIn.id,
          summary: `Production: filled ${input.quantity} bottles`,
          after: { emptyOut, filledIn },
        },
        tx,
      )
      return { emptyOut, filledIn }
    })

    const product = db.select().from(products).where(eq(products.id, productId)).get()
    return {
      emptyOut: toDto(result.emptyOut, { productName: product?.name }),
      filledIn: toDto(result.filledIn, { productName: product?.name }),
    }
  }

  function recordDamage(input: RecordDamageInput & { userId?: number | null }): {
    movement: StockMovementDto
    adjustmentId: number | null
  } {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const productId = resolveProductId(input.productId)

    if (input.fromLocation === 'customer' && !input.customerId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'customerId is required when fromLocation is customer',
      )
    }
    if (input.fromLocation === 'van' && !input.vehicleId) {
      throw new AppError('VALIDATION_FAILED', 'vehicleId is required when fromLocation is van')
    }

    const result = db.transaction((tx) => {
      const m = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: input.bottleState,
        quantity: input.quantity,
        fromLocation: input.fromLocation,
        toLocation: 'scrap',
        reason: input.reason,
        vehicleId: input.vehicleId ?? null,
        customerId: input.customerId ?? null,
        notes: input.notes,
        createdBy: input.userId ?? null,
      })

      let adjustmentId: number | null = null
      if (
        input.chargeCustomer &&
        input.customerId &&
        (input.reason === 'lost' || input.reason === 'damaged')
      ) {
        const kind = input.reason === 'lost' ? 'lost_bottle' : 'damaged_bottle'
        const rate = rates.getRateFor(input.customerId, productId, input.date)
        const amount = input.chargeAmount ?? rate * input.quantity
        if (amount <= 0) {
          throw new AppError('VALIDATION_FAILED', 'Charge amount must be positive')
        }
        const now = nowIsoUtc()
        const adj = tx
          .insert(customerAdjustments)
          .values({
            uuid: newUuid(),
            customerId: input.customerId,
            adjustmentDate: input.date,
            kind,
            amount,
            quantity: input.quantity,
            description: input.notes,
            invoiceId: null,
            status: 'active',
            createdAt: now,
            createdBy: input.userId ?? null,
          })
          .returning()
          .get()
        adjustmentId = adj.id
        tx.update(stockMovements)
          .set({ refTable: 'customer_adjustments', refId: adj.id })
          .where(eq(stockMovements.id, m.id))
          .run()
        balances.upsertSummary(
          input.customerId,
          {
            balance: balances.computeLiveBalance(input.customerId, tx),
            bottlesWithCustomer: balances.computeLiveBottles(input.customerId, tx),
          },
          tx,
        )
        audit.record(
          {
            userId: input.userId,
            action: 'create',
            entityTable: 'customer_adjustments',
            entityId: adj.id,
            summary: `Charged ${kind} × ${input.quantity}`,
            after: adj,
          },
          tx,
        )
      }

      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'stock_movements',
          entityId: m.id,
          summary: `${input.reason}: ${input.quantity} ${input.bottleState} from ${input.fromLocation}`,
          after: m,
        },
        tx,
      )
      return { m, adjustmentId }
    })

    const product = db.select().from(products).where(eq(products.id, productId)).get()
    return {
      movement: toDto(result.m, { productName: product?.name }),
      adjustmentId: result.adjustmentId,
    }
  }

  function recordAdjustment(
    input: RecordAdjustmentInput & { userId?: number | null },
  ): StockMovementDto {
    assertBusinessDate(input.date)
    period.guardPeriodOpen(input.date)
    const productId = resolveProductId(input.productId)
    if (input.location === 'van' && !input.vehicleId) {
      throw new AppError('VALIDATION_FAILED', 'vehicleId required for van adjustments')
    }

    const qty = Math.abs(input.delta)
    const adding = input.delta > 0

    const row = db.transaction((tx) => {
      const m = record(tx, {
        movementDate: input.date,
        productId,
        bottleState: input.bottleState,
        quantity: qty,
        fromLocation: adding ? 'none' : input.location,
        toLocation: adding ? input.location : 'scrap',
        reason: 'adjustment',
        vehicleId: input.vehicleId ?? null,
        notes: input.notes,
        createdBy: input.userId ?? null,
      })
      audit.record(
        {
          userId: input.userId,
          action: 'create',
          entityTable: 'stock_movements',
          entityId: m.id,
          summary: `Adjustment ${input.delta > 0 ? '+' : ''}${input.delta} ${input.bottleState} at ${input.location}: ${input.notes}`,
          after: m,
        },
        tx,
      )
      return m
    })

    const product = db.select().from(products).where(eq(products.id, productId)).get()
    return toDto(row, { productName: product?.name })
  }

  function listBottlesOut(input: {
    search?: string
    routeId?: number
    areaId?: number
    minBottles?: number
    shortfallOnly?: boolean
    noReturnDays?: number
  }): InventoryBottlesOutOutput {
    const product = db.select().from(products).where(eq(products.isDefault, 1)).get()
    const defaultDeposit = product?.defaultDeposit ?? 0
    const today = todayBusinessDate()
    const min = input.minBottles ?? 1

    const conditions = [
      sql`${customers.deletedAt} IS NULL`,
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

    let items = rows.map((r) => {
      let daysSinceLastReturn: number | null = null
      const lastReturn = lastReturnMap.get(r.customerId) ?? null
      if (lastReturn) {
        const a = new Date(`${lastReturn}T12:00:00`).getTime()
        const b = new Date(`${today}T12:00:00`).getTime()
        daysSinceLastReturn = Math.max(0, Math.round((b - a) / 86_400_000))
      }
      const needed = r.bottlesWithCustomer * defaultDeposit
      const shortfall = Math.max(0, needed - r.securityDepositHeld)
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
        depositShortfallAmount: shortfall,
        lastDeliveryDate: r.lastDeliveryDate,
        lastEmptyReturnDate: lastReturn,
        daysSinceLastReturn,
      }
    })

    if (input.shortfallOnly) {
      items = items.filter((i) => i.depositShortfallAmount > 0)
    }
    if (input.noReturnDays != null) {
      items = items.filter(
        (i) => i.daysSinceLastReturn == null || i.daysSinceLastReturn >= input.noReturnDays!,
      )
    }

    const totalBottles = items.reduce((s, i) => s + i.bottlesWithCustomer, 0)
    return {
      items,
      summary: {
        totalBottlesWithCustomers: totalBottles,
        totalValueAtDepositRate: totalBottles * defaultDeposit,
        totalDepositShortfall: items.reduce((s, i) => s + i.depositShortfallAmount, 0),
      },
    }
  }

  /** Sum of customer_balances.bottles_with_customer (for consistency tests). */
  function sumCustomerBottles(): number {
    const row = db
      .select({
        total: sql<number>`coalesce(sum(${customerBalances.bottlesWithCustomer}), 0)`,
      })
      .from(customerBalances)
      .get()
    return Number(row?.total ?? 0)
  }

  return {
    record,
    getBalances,
    listMovements,
    syncDeliveryMovements,
    clearDeliveryMovements,
    writeCustomerOpeningMovement,
    writeAdjustmentScrapMovement,
    recordOpeningStock,
    purchaseBottles,
    recordProduction,
    recordDamage,
    recordAdjustment,
    listBottlesOut,
    sumCustomerBottles,
  }
}

export type StockService = ReturnType<typeof createStockService>
