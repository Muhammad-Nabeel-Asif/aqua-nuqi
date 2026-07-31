import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { customerRates, customers, products } from '@main/db/schema'
import { newUuid } from '@main/lib/ids'
import type { CustomerRateDto } from '@shared/contracts'
import { addBusinessDays, assertBusinessDate, nowIsoUtc } from '@shared/date'
import { AppError } from '@shared/errors'
import type { AuditService } from './audit.service'
import type { PeriodService } from './period.service'

type DbLike = AppDatabase

function toRateDto(row: typeof customerRates.$inferSelect): CustomerRateDto {
  return {
    id: row.id,
    uuid: row.uuid,
    customerId: row.customerId,
    productId: row.productId,
    rate: row.rate,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    reason: row.reason,
    createdAt: row.createdAt,
  }
}

export function createRateService(db: AppDatabase, audit: AuditService, period: PeriodService) {
  /**
   * Single pricing function for every module.
   * Fallback: covering customer_rates row for the date → products.default_rate.
   */
  function getRateFor(customerId: number, productId: number, onDate: string): number {
    assertBusinessDate(onDate)
    const row = db
      .select()
      .from(customerRates)
      .where(
        and(
          eq(customerRates.customerId, customerId),
          eq(customerRates.productId, productId),
          lte(customerRates.effectiveFrom, onDate),
          or(isNull(customerRates.effectiveTo), gte(customerRates.effectiveTo, onDate)),
        ),
      )
      .orderBy(desc(customerRates.effectiveFrom))
      .get()

    if (row) return row.rate

    const product = db.select().from(products).where(eq(products.id, productId)).get()
    if (!product) {
      throw new AppError('NOT_FOUND', `Product ${productId} not found`)
    }
    return product.defaultRate
  }

  function listHistory(customerId: number, productId?: number): CustomerRateDto[] {
    const rows = db
      .select()
      .from(customerRates)
      .where(
        productId
          ? and(eq(customerRates.customerId, customerId), eq(customerRates.productId, productId))
          : eq(customerRates.customerId, customerId),
      )
      .all()
    rows.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
    return rows.map(toRateDto)
  }

  function resolveDefaultProductId(productId?: number): number {
    if (productId) return productId
    const def = db.select().from(products).where(eq(products.isDefault, 1)).get()
    if (!def) throw new AppError('NOT_FOUND', 'No default product configured')
    return def.id
  }

  /**
   * Close the current open rate row and insert a new one. Never updates rate in place.
   */
  function changeRate(
    input: {
      customerId: number
      productId?: number
      rate: number
      effectiveFrom: string
      reason?: string | null
      forceClosedPeriod?: boolean
      userId?: number | null
    },
    tx: DbLike = db,
  ): { item: CustomerRateDto; warning: string | null } {
    assertBusinessDate(input.effectiveFrom)
    const productId = resolveDefaultProductId(input.productId)

    const customer = tx.select().from(customers).where(eq(customers.id, input.customerId)).get()
    if (!customer || customer.deletedAt) {
      throw new AppError('NOT_FOUND', 'Customer not found')
    }

    let warning: string | null = null
    try {
      period.guardPeriodOpen(input.effectiveFrom)
    } catch (err) {
      if (err instanceof AppError && err.code === 'PERIOD_LOCKED') {
        warning = `Effective date ${input.effectiveFrom} falls in a closed period.`
        if (!input.forceClosedPeriod) {
          throw new AppError(
            'PERIOD_LOCKED',
            `${warning} Confirm to proceed anyway, or choose another date.`,
            { warning },
          )
        }
      } else {
        throw err
      }
    }

    const now = nowIsoUtc()
    const effectiveToPrev = addBusinessDays(input.effectiveFrom, -1)

    const openRow = tx
      .select()
      .from(customerRates)
      .where(
        and(
          eq(customerRates.customerId, input.customerId),
          eq(customerRates.productId, productId),
          isNull(customerRates.effectiveTo),
        ),
      )
      .get()

    if (openRow) {
      if (openRow.effectiveFrom >= input.effectiveFrom) {
        throw new AppError(
          'CONFLICT',
          `A rate already starts on ${openRow.effectiveFrom}. Choose a later effective date.`,
        )
      }
      // Close only — never rewrite the rate amount.
      tx.update(customerRates)
        .set({ effectiveTo: effectiveToPrev })
        .where(eq(customerRates.id, openRow.id))
        .run()
    }

    const inserted = tx
      .insert(customerRates)
      .values({
        uuid: newUuid(),
        customerId: input.customerId,
        productId,
        rate: input.rate,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        reason: input.reason ?? null,
        createdAt: now,
        createdBy: input.userId ?? null,
      })
      .returning()
      .get()

    audit.record(
      {
        userId: input.userId,
        action: 'create',
        entityTable: 'customer_rates',
        entityId: inserted.id,
        summary: `Rate for ${customer.code} → ${input.rate} paisa from ${input.effectiveFrom}`,
        before: openRow ? toRateDto({ ...openRow, effectiveTo: effectiveToPrev }) : undefined,
        after: toRateDto(inserted),
      },
      tx,
    )

    return { item: toRateDto(inserted), warning }
  }

  function bulkChangeRate(input: {
    customerIds: number[]
    productId?: number
    rate: number
    effectiveFrom: string
    reason?: string | null
    userId?: number | null
  }): { created: number; items: CustomerRateDto[] } {
    assertBusinessDate(input.effectiveFrom)
    period.guardPeriodOpen(input.effectiveFrom)

    const items: CustomerRateDto[] = []
    db.transaction((tx) => {
      for (const customerId of input.customerIds) {
        const result = changeRate(
          {
            customerId,
            productId: input.productId,
            rate: input.rate,
            effectiveFrom: input.effectiveFrom,
            reason: input.reason,
            userId: input.userId,
          },
          tx,
        )
        items.push(result.item)
      }
    })
    return { created: items.length, items }
  }

  return { getRateFor, listHistory, changeRate, bulkChangeRate, resolveDefaultProductId }
}

export type RateService = ReturnType<typeof createRateService>
