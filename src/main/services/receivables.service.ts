import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { areas, customerBalances, customers, invoices, routes } from '@main/db/schema'
import { todayBusinessDate } from '@shared/date'

export type AgeingBucket = 'current' | '1-30' | '31-60' | '60+'

export type ReceivableRow = {
  customerId: number
  code: string
  name: string
  phone: string | null
  areaName: string | null
  routeName: string | null
  balance: number
  oldestUnpaidInvoiceDate: string | null
  daysOverdue: number
  ageingBucket: AgeingBucket
  lastPaymentDate: string | null
}

export type ReceivablesReport = {
  asOf: string
  outstanding: ReceivableRow[]
  inCredit: ReceivableRow[]
  bucketTotals: Record<AgeingBucket, number>
  totalOutstanding: number
  totalCredit: number
}

function bucketFor(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  return '60+'
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function createReceivablesService(db: AppDatabase) {
  function report(asOf: string = todayBusinessDate()): ReceivablesReport {
    const balances = db.select().from(customerBalances).all()
    const outstanding: ReceivableRow[] = []
    const inCredit: ReceivableRow[] = []
    const bucketTotals: Record<AgeingBucket, number> = {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '60+': 0,
    }

    for (const bal of balances) {
      if (bal.balance === 0) continue
      const customer = db
        .select()
        .from(customers)
        .where(and(eq(customers.id, bal.customerId), isNull(customers.deletedAt)))
        .get()
      if (!customer || customer.customerType === 'walk_in') continue

      const area = customer.areaId
        ? db.select().from(areas).where(eq(areas.id, customer.areaId)).get()
        : null
      const route = customer.routeId
        ? db.select().from(routes).where(eq(routes.id, customer.routeId)).get()
        : null

      let oldestUnpaidInvoiceDate: string | null = null
      let daysOverdue = 0
      let ageingBucket: AgeingBucket = 'current'

      if (bal.balance > 0) {
        const unpaid = db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.customerId, bal.customerId),
              sql`${invoices.status} IN ('issued','partially_paid')`,
            ),
          )
          .all()
          .sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1))

        if (unpaid.length > 0) {
          const oldest = unpaid[0]!
          oldestUnpaidInvoiceDate = oldest.issueDate
          const due = oldest.dueDate ?? oldest.issueDate
          daysOverdue = Math.max(0, daysBetween(due, asOf))
          ageingBucket = bucketFor(daysOverdue)
        }
      }

      const row: ReceivableRow = {
        customerId: customer.id,
        code: customer.code,
        name: customer.name,
        phone: customer.phonePrimary,
        areaName: area?.name ?? null,
        routeName: route?.name ?? null,
        balance: bal.balance,
        oldestUnpaidInvoiceDate,
        daysOverdue,
        ageingBucket,
        lastPaymentDate: bal.lastPaymentDate,
      }

      if (bal.balance > 0) {
        outstanding.push(row)
        bucketTotals[ageingBucket] += bal.balance
      } else {
        inCredit.push(row)
      }
    }

    outstanding.sort((a, b) => b.balance - a.balance)
    inCredit.sort((a, b) => a.balance - b.balance)

    return {
      asOf,
      outstanding,
      inCredit,
      bucketTotals,
      totalOutstanding: outstanding.reduce((s, r) => s + r.balance, 0),
      totalCredit: inCredit.reduce((s, r) => s + r.balance, 0),
    }
  }

  return { report, ageingBucket: bucketFor, daysBetween }
}

export type ReceivablesService = ReturnType<typeof createReceivablesService>
