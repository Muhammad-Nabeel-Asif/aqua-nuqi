import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { customerBalances } from '@main/db/schema'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

describe('paymentService', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-pay-svc-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  async function twoIssuedInvoices() {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id)
    services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-10',
      quantity: 10,
      userId: owner.id,
    })
    services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-08-05',
      quantity: 5,
      userId: owner.id,
    })
    const july = services.billing.issueInvoice(
      services.billing.generateInvoice(
        customer.id,
        '2026-07',
        { issueDate: '2026-08-01' },
        owner.id,
      ).id,
      owner.id,
    )
    const august = services.billing.issueInvoice(
      services.billing.generateInvoice(
        customer.id,
        '2026-08',
        { issueDate: '2026-09-01' },
        owner.id,
      ).id,
      owner.id,
    )
    return { customer, july, august, owner, services }
  }

  it('allocates FIFO to the oldest unpaid invoice first', async () => {
    const { customer, july, august, owner, services } = await twoIssuedInvoices()
    expect(july.totalPayable).toBe(Number(toPaisa(600)))
    expect(august.totalPayable).toBe(Number(toPaisa(300)))

    const pay = services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-09-05',
        amount: Number(toPaisa(700)),
        method: 'cash',
      },
      owner.id,
    )

    const byInvoice = new Map(pay.allocations.map((a) => [a.invoiceId, a]))
    expect(byInvoice.get(july.id)?.amount).toBe(Number(toPaisa(600)))
    expect(byInvoice.get(august.id)?.amount).toBe(Number(toPaisa(100)))

    expect(services.billing.getById(july.id).status).toBe('paid')
    expect(services.billing.getById(august.id).status).toBe('partially_paid')
  })

  it('reallocate supersedes prior allocation rows', async () => {
    const { customer, july, august, owner, services } = await twoIssuedInvoices()
    const pay = services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-09-05',
        amount: Number(toPaisa(300)),
        method: 'cash',
      },
      owner.id,
    )
    expect(pay.allocations[0]?.invoiceId).toBe(july.id)

    const moved = services.payments.reallocate(
      pay.id,
      [{ invoiceId: august.id, amount: Number(toPaisa(300)) }],
      owner.id,
    )
    expect(moved.allocations.filter((a) => a.status === 'active')).toHaveLength(1)
    expect(moved.allocations.find((a) => a.status === 'active')?.invoiceId).toBe(august.id)
    expect(services.billing.getById(july.id).paidTotal).toBe(0)
    expect(services.billing.getById(august.id).paidTotal).toBe(Number(toPaisa(300)))
  })

  it('void payment restores invoice paid state and ledger/balance match after recalculate', async () => {
    const { customer, july, owner, services, db } = {
      ...(await twoIssuedInvoices()),
      db: app.db,
    }
    const before = Number(services.ledger.getBalance(customer.id))
    const pay = services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-09-05',
        amount: Number(toPaisa(200)),
        method: 'cash',
      },
      owner.id,
    )
    expect(services.billing.getById(july.id).paidTotal).toBe(Number(toPaisa(200)))

    services.payments.voidPayment(pay.id, 'Misposted', owner.id)
    const restored = services.billing.getById(july.id)
    expect(restored.paidTotal).toBe(0)
    expect(restored.status).toBe('issued')
    expect(Number(services.ledger.getBalance(customer.id))).toBe(before)

    services.balances.recalculate(customer.id)
    const row = db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, customer.id))
      .get()
    expect(row?.balance).toBe(Number(services.ledger.getBalance(customer.id)))
  })

  it('deposit purpose is not allocated to invoices', async () => {
    const { customer, july, owner, services } = await twoIssuedInvoices()
    const pay = services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-09-05',
        amount: Number(toPaisa(100)),
        method: 'cash',
        purpose: 'deposit',
      },
      owner.id,
    )
    expect(pay.purpose).toBe('deposit')
    expect(pay.allocations).toHaveLength(0)
    expect(services.billing.getById(july.id).paidTotal).toBe(0)
  })

  it('rejects deposit wording unless purpose is deposit', async () => {
    const { customer, owner, services } = await twoIssuedInvoices()
    expect(() =>
      services.payments.recordPayment(
        {
          customerId: customer.id,
          date: '2026-09-05',
          amount: Number(toPaisa(50)),
          method: 'cash',
          notes: 'bottle security deposit',
        },
        owner.id,
      ),
    ).toThrow(AppError)
  })
})
