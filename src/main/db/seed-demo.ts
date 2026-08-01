/**
 * Dev-only demo seed: ~200 realistic customers across 6 areas / 10 routes,
 * plus 4–5 months of delivery history for performance / month-boundary checks.
 * Invoked via IPC `dev:seedDemo` (non-production).
 */
import { eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { areas, customers, deliveries, products, routes } from '@main/db/schema'
import type { AuditService } from '@main/services/audit.service'
import type { BalanceService } from '@main/services/balance.service'
import { createCustomerService } from '@main/services/customer.service'
import { createDeliveryService } from '@main/services/delivery.service'
import { createMasterDataService } from '@main/services/master-data.service'
import type { PeriodService } from '@main/services/period.service'
import type { RateService } from '@main/services/rate.service'
import { addBusinessDays, todayBusinessDate } from '@shared/date'
import { toPaisa } from '@shared/money'

const AREA_NAMES = [
  'Gulberg',
  'Model Town',
  'Johar Town',
  'DHA Phase 5',
  'Cantt',
  'Faisal Town',
] as const

const ROUTE_DEFS: { name: string; area: (typeof AREA_NAMES)[number] }[] = [
  { name: 'Gulberg Morning', area: 'Gulberg' },
  { name: 'Gulberg Evening', area: 'Gulberg' },
  { name: 'Model Town A', area: 'Model Town' },
  { name: 'Model Town B', area: 'Model Town' },
  { name: 'Johar Central', area: 'Johar Town' },
  { name: 'Johar West', area: 'Johar Town' },
  { name: 'DHA Loop', area: 'DHA Phase 5' },
  { name: 'Cantt Main', area: 'Cantt' },
  { name: 'Faisal Morning', area: 'Faisal Town' },
  { name: 'Faisal Evening', area: 'Faisal Town' },
]

const FIRST = [
  'Ali',
  'Ahmed',
  'Hassan',
  'Usman',
  'Bilal',
  'Omar',
  'Fatima',
  'Ayesha',
  'Zainab',
  'Sara',
  'Hamza',
  'Ibrahim',
  'Maryam',
  'Noor',
  'Sana',
  'Kamran',
  'Imran',
  'Nida',
  'Saba',
  'Tariq',
]
const LAST = [
  'Khan',
  'Ahmed',
  'Hussain',
  'Ali',
  'Raza',
  'Malik',
  'Sheikh',
  'Butt',
  'Chaudhry',
  'Qureshi',
  'Siddiqui',
  'Mirza',
  'Baig',
  'Ansari',
  'Shah',
]

const RATES_RUPEES = [50, 55, 60, 65, 70, 75, 80]

export function seedDemoCustomers(
  db: AppDatabase,
  deps: {
    audit: AuditService
    period: PeriodService
    rate: RateService
    balance: BalanceService
    userId?: number | null
  },
): { areas: number; routes: number; customers: number; deliveries: number } {
  const master = createMasterDataService(db, deps.audit)
  const customerService = createCustomerService(
    db,
    deps.audit,
    deps.period,
    deps.rate,
    deps.balance,
  )
  const deliveryService = createDeliveryService(
    db,
    deps.audit,
    deps.period,
    deps.rate,
    deps.balance,
  )

  // Ensure default product has a sensible default rate
  const product = db.select().from(products).where(eq(products.isDefault, 1)).get()
  if (product && product.defaultRate === 0) {
    db.update(products)
      .set({ defaultRate: Number(toPaisa(60)), defaultDeposit: Number(toPaisa(500)) })
      .where(eq(products.id, product.id))
      .run()
  } else if (product && (product.defaultDeposit ?? 0) === 0) {
    db.update(products)
      .set({ defaultDeposit: Number(toPaisa(500)) })
      .where(eq(products.id, product.id))
      .run()
  }

  const existing = db.select().from(customers).where(isNull(customers.deletedAt)).all().length
  let createdCount = 0
  let areasCreated = 0
  let routesCreated = 0

  const areaIds = new Map<string, number>()
  for (const name of AREA_NAMES) {
    const existingArea = db.select().from(areas).where(eq(areas.name, name)).get()
    if (existingArea) {
      areaIds.set(name, existingArea.id)
    } else {
      const created = master.createArea({ name }, deps.userId)
      areaIds.set(name, created.id)
      areasCreated += 1
    }
  }

  const routeIds: number[] = []
  for (const def of ROUTE_DEFS) {
    const existingRoute = db.select().from(routes).where(eq(routes.name, def.name)).get()
    if (existingRoute) {
      routeIds.push(existingRoute.id)
    } else {
      const created = master.createRoute(
        { name: def.name, areaId: areaIds.get(def.area) ?? null },
        deps.userId,
      )
      routeIds.push(created.id)
      routesCreated += 1
    }
  }

  if (existing < 150) {
    const asOf = '2026-03-01'
    for (let i = 0; i < 200; i++) {
      const first = FIRST[i % FIRST.length]!
      const last = LAST[Math.floor(i / FIRST.length) % LAST.length]!
      const name = `${first} ${last} ${Math.floor(i / (FIRST.length * LAST.length)) + 1}`
      const routeId = routeIds[i % routeIds.length]!
      const route = db.select().from(routes).where(eq(routes.id, routeId)).get()
      const areaId = route?.areaId ?? null
      const rateRs = RATES_RUPEES[i % RATES_RUPEES.length]!
      const paused = i % 17 === 0
      const inactive = i % 41 === 0
      const withOpening = i % 5 === 0
      const openingBalance = withOpening ? Number(toPaisa(500 + (i % 10) * 500)) : 0
      const openingBottles = withOpening ? 2 + (i % 6) : 0
      const type = i % 11 === 0 ? 'commercial' : i % 29 === 0 ? 'walk_in' : 'residential'
      const phone = `03${String(100000000 + i * 37).slice(0, 9)}`

      customerService.create(
        {
          name,
          customerType: type,
          phonePrimary: phone,
          whatsappNumber: phone,
          addressLine: `House ${10 + (i % 90)}, Street ${(i % 20) + 1}`,
          landmark: i % 3 === 0 ? 'Near park' : null,
          areaId,
          routeId,
          billingMode: i % 23 === 0 ? 'monthly_package' : 'per_bottle',
          packageAmount: i % 23 === 0 ? Number(toPaisa(2500)) : null,
          packageIncludedQty: i % 23 === 0 ? 40 : null,
          packageExcessRate: i % 23 === 0 ? Number(toPaisa(70)) : null,
          rate: Number(toPaisa(rateRs)),
          openingBalance,
          openingBottles,
          openingAsOf: withOpening ? asOf : null,
          securityDepositHeld: openingBottles > 0 ? Number(toPaisa(openingBottles * 500)) : 0,
          joinedOn: '2026-03-01',
          status: inactive ? 'inactive' : paused ? 'paused' : 'active',
          statusReason: inactive ? 'Demo inactive' : paused ? 'Away for a month' : null,
          notes: i % 7 === 0 ? 'Ring bell twice' : null,
          schedule:
            i % 3 === 0
              ? {
                  mode: 'weekdays' as const,
                  weekdays: '1,3,5',
                  intervalDays: null,
                  defaultQty: 2 + (i % 3),
                }
              : i % 3 === 1
                ? {
                    mode: 'interval_days' as const,
                    weekdays: null,
                    intervalDays: 3 + (i % 4),
                    defaultQty: 1 + (i % 3),
                  }
                : {
                    mode: 'on_call' as const,
                    weekdays: null,
                    intervalDays: null,
                    defaultQty: 2,
                  },
        },
        deps.userId,
      )
      createdCount += 1
    }
  }

  const deliveryCount = seedDemoDeliveries(db, deliveryService, deps.userId)

  return {
    areas: areasCreated || AREA_NAMES.length,
    routes: routesCreated || ROUTE_DEFS.length,
    customers: createdCount,
    deliveries: deliveryCount,
  }
}

/**
 * Generate ~4.5 months of realistic deliveries ending at today (or 2026-07-31 for
 * stable month-boundary demos when today is outside the seed window).
 */
function seedDemoDeliveries(
  db: AppDatabase,
  deliveryService: ReturnType<typeof createDeliveryService>,
  userId?: number | null,
): number {
  const existingCount = db
    .select({ c: sql<number>`count(*)` })
    .from(deliveries)
    .get()?.c
  if (Number(existingCount) >= 1000) return 0

  const active = db
    .select({
      id: customers.id,
      status: customers.status,
      customerType: customers.customerType,
    })
    .from(customers)
    .where(andActive())
    .all()
    .filter((c) => c.status === 'active' && c.customerType !== 'walk_in')

  // Seed window: 2026-03-01 → 2026-07-31 (5 months) so Phase 2 month boundaries are stable
  const start = '2026-03-01'
  const end = '2026-07-31'
  let created = 0

  for (let i = 0; i < active.length; i++) {
    const customer = active[i]!
    // Frequency patterns: every 2/3/4/5 days, with occasional gaps
    const interval = 2 + (i % 4)
    const qtyBase = 1 + (i % 4)
    let date = addBusinessDays(start, i % interval)

    while (date <= end) {
      // Skip ~12% of visits (missed / gap months for some customers)
      const skip = (i * 13 + Number(date.slice(8, 10))) % 17 === 0
      // Leave July quieter for some customers (month gap)
      const julyGap = date.startsWith('2026-07') && i % 11 === 0
      if (!skip && !julyGap) {
        const qty = qtyBase + ((Number(date.slice(8, 10)) + i) % 3 === 0 ? 1 : 0)
        const emptiesOdd = (i + Number(date.slice(8, 10))) % 9 === 0
        try {
          deliveryService.upsertDelivery({
            customerId: customer.id,
            date,
            quantity: qty,
            emptiesCollected: emptiesOdd ? Math.max(0, qty - 1) : qty,
            // occasional empties-only return
            ...(i % 31 === 0 && Number(date.slice(8, 10)) === 15
              ? { quantity: 0, emptiesCollected: 3 }
              : {}),
            userId,
          })
          created += 1
        } catch {
          // ignore period/validation issues in seed
        }
      }
      date = addBusinessDays(date, interval)
    }
  }

  // Also seed a handful of deliveries on "today" for daily-entry demos when today is in range
  const today = todayBusinessDate()
  if (today >= start && today <= end) {
    for (let i = 0; i < Math.min(40, active.length); i++) {
      const c = active[i]!
      try {
        deliveryService.upsertDelivery({
          customerId: c.id,
          date: today,
          quantity: 2,
          userId,
        })
        created += 1
      } catch {
        // ignore
      }
    }
  }

  return created
}

function andActive() {
  return isNull(customers.deletedAt)
}
