import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'
import { toPaisa } from '@shared/money'

describe('receivablesService', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-recv-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('issued invoice appears in outstanding; payment reduces it', async () => {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id)
    services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 10,
      userId: owner.id,
    })
    const inv = services.billing.issueInvoice(
      services.billing.generateInvoice(
        customer.id,
        '2026-07',
        { issueDate: '2026-08-01' },
        owner.id,
      ).id,
      owner.id,
    )
    const before = services.receivables.report('2026-08-05')
    const row = before.outstanding.find((r) => r.customerId === customer.id)
    expect(row).toBeTruthy()
    expect(row!.balance).toBe(inv.totalPayable)

    services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-08-05',
        amount: Number(toPaisa(200)),
        method: 'cash',
      },
      owner.id,
    )
    const after = services.receivables.report('2026-08-05')
    const next = after.outstanding.find((r) => r.customerId === customer.id)
    expect(next?.balance).toBe(inv.totalPayable - Number(toPaisa(200)))
  })
})
