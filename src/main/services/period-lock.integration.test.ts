import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

describe('period lock blocks mutating writes', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-period-lock-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('after period.close, deliveries/expenses/payments/invoices fail; reopen restores writes', async () => {
    const { services, owner } = app
    const customer = seedMinimalCustomer(services, owner.id)
    const electricity = services.expenses.findCategoryByName('Electricity')
    expect(electricity).toBeTruthy()

    services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-01',
      quantity: 1,
      userId: owner.id,
    })

    services.period.close('2026-07', owner.id)

    expect(() =>
      services.deliveries.upsertDelivery({
        customerId: customer.id,
        date: '2026-07-15',
        quantity: 2,
        userId: owner.id,
      }),
    ).toThrow(AppError)
    try {
      services.deliveries.upsertDelivery({
        customerId: customer.id,
        date: '2026-07-15',
        quantity: 2,
        userId: owner.id,
      })
    } catch (err) {
      expect(err).toMatchObject({ code: 'PERIOD_LOCKED' })
    }

    expect(() =>
      services.expenses.createExpense(
        {
          expenseDate: '2026-07-10',
          categoryId: electricity!.id,
          amount: Number(toPaisa(100)),
          paymentMethod: 'cash',
        },
        owner.id,
      ),
    ).toThrow(AppError)

    expect(() =>
      services.payments.recordPayment(
        {
          customerId: customer.id,
          date: '2026-07-20',
          amount: Number(toPaisa(50)),
          method: 'cash',
        },
        owner.id,
      ),
    ).toThrow(AppError)

    expect(() =>
      services.billing.generateInvoice(
        customer.id,
        '2026-07',
        { issueDate: '2026-08-01' },
        owner.id,
      ),
    ).toThrow(AppError)

    services.period.reopen('2026-07', owner.id, 'Need to record a missed delivery')

    const delivery = services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-15',
      quantity: 2,
      userId: owner.id,
    })
    expect(delivery.quantity).toBe(2)

    const expense = services.expenses.createExpense(
      {
        expenseDate: '2026-07-10',
        categoryId: electricity!.id,
        amount: Number(toPaisa(100)),
        paymentMethod: 'cash',
      },
      owner.id,
    )
    expect(expense.amount).toBe(Number(toPaisa(100)))

    const invoice = services.billing.generateInvoice(
      customer.id,
      '2026-07',
      { issueDate: '2026-08-01' },
      owner.id,
    )
    expect(invoice.period).toBe('2026-07')
    const issued = services.billing.issueInvoice(invoice.id, owner.id)
    expect(issued.status).toBe('issued')

    const payment = services.payments.recordPayment(
      {
        customerId: customer.id,
        date: '2026-07-20',
        amount: Number(toPaisa(50)),
        method: 'cash',
      },
      owner.id,
    )
    expect(payment.amount).toBe(Number(toPaisa(50)))
  })
})
