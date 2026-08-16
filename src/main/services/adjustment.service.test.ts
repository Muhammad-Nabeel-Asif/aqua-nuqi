import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

describe('adjustmentService', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-adj-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('discount stays unbilled (ledger unchanged) until invoiced; void removes it', async () => {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id, {
      openingBalance: Number(toPaisa(500)),
    })
    const before = Number(services.ledger.getBalance(customer.id))
    const adj = services.adjustments.create(
      {
        customerId: customer.id,
        adjustmentDate: '2026-07-15',
        kind: 'discount',
        amount: Number(toPaisa(100)),
        description: 'Goodwill',
      },
      owner.id,
    )
    expect(adj.invoiceId).toBeNull()
    expect(adj.sign).toBe(-1)
    expect(Number(services.ledger.getBalance(customer.id))).toBe(before)
    expect(services.adjustments.listForCustomer(customer.id, { unbilledOnly: true })).toHaveLength(
      1,
    )
    services.adjustments.void(adj.id, 'Entered twice', owner.id)
    expect(services.adjustments.getById(adj.id).status).toBe('void')
    expect(services.adjustments.listForCustomer(customer.id, { unbilledOnly: true })).toHaveLength(
      0,
    )
    expect(Number(services.ledger.getBalance(customer.id))).toBe(before)
  })

  it('deposit_received credits ledger immediately; void restores it', async () => {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id, {
      openingBalance: Number(toPaisa(500)),
    })
    const before = Number(services.ledger.getBalance(customer.id))
    const adj = services.adjustments.create(
      {
        customerId: customer.id,
        adjustmentDate: '2026-07-15',
        kind: 'deposit_received',
        amount: Number(toPaisa(100)),
        description: 'Security deposit',
      },
      owner.id,
    )
    expect(Number(services.ledger.getBalance(customer.id))).toBe(before - Number(toPaisa(100)))
    services.adjustments.void(adj.id, 'Entered twice', owner.id)
    expect(Number(services.ledger.getBalance(customer.id))).toBe(before)
  })

  it('closed period blocks adjustments', async () => {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id)
    services.period.close('2026-07', owner.id)
    expect(() =>
      services.adjustments.create(
        {
          customerId: customer.id,
          adjustmentDate: '2026-07-15',
          kind: 'discount',
          amount: Number(toPaisa(50)),
        },
        owner.id,
      ),
    ).toThrow(AppError)
  })
})
