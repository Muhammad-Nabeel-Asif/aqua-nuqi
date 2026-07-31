/**
 * Dev-only demo seed: ~200 realistic customers across 6 areas / 10 routes.
 * Invoked via IPC `dev:seedDemo` (non-production) or `npm run seed:demo`.
 */
import { eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { areas, customers, products, routes } from '@main/db/schema'
import type { AuditService } from '@main/services/audit.service'
import type { BalanceService } from '@main/services/balance.service'
import { createCustomerService } from '@main/services/customer.service'
import { createMasterDataService } from '@main/services/master-data.service'
import type { PeriodService } from '@main/services/period.service'
import type { RateService } from '@main/services/rate.service'
import { todayBusinessDate } from '@shared/date'
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
): { areas: number; routes: number; customers: number } {
  const existing = db.select().from(customers).where(isNull(customers.deletedAt)).all().length
  if (existing >= 150) {
    return { areas: 0, routes: 0, customers: 0 }
  }

  const master = createMasterDataService(db, deps.audit)
  const customerService = createCustomerService(
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
      .set({ defaultRate: Number(toPaisa(60)) })
      .where(eq(products.id, product.id))
      .run()
  }

  const areaIds = new Map<string, number>()
  for (const name of AREA_NAMES) {
    const existingArea = db.select().from(areas).where(eq(areas.name, name)).get()
    if (existingArea) {
      areaIds.set(name, existingArea.id)
    } else {
      const created = master.createArea({ name }, deps.userId)
      areaIds.set(name, created.id)
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
    }
  }

  const asOf = '2026-07-01'
  let createdCount = 0
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
        joinedOn: todayBusinessDate(),
        status: inactive ? 'inactive' : paused ? 'paused' : 'active',
        statusReason: inactive ? 'Demo inactive' : paused ? 'Away for a month' : null,
        notes: i % 7 === 0 ? 'Ring bell twice' : null,
      },
      deps.userId,
    )
    createdCount += 1
  }

  return { areas: AREA_NAMES.length, routes: ROUTE_DEFS.length, customers: createdCount }
}
