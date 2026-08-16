import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { seedMinimalCustomer } from '@main/test/seed-minimal'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'

describe('tripService gaps (start/close/void + cash-variance note)', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-trip-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('start → close with matching cash does not require a note; void of an open trip works', async () => {
    const { services, owner } = app
    services.stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 200,
      userId: owner.id,
    })
    const vehicle = services.vehicles.create({ name: 'Van A', vehicleType: 'van' }, owner.id)
    const emp = services.employees.create(
      { name: 'Driver A', role: 'delivery', joiningDate: '2026-06-01' },
      owner.id,
    )
    const opened = services.trips.startTrip({
      tripDate: '2026-07-15',
      employeeId: emp.id,
      vehicleId: vehicle.id,
      filledLoaded: 20,
      userId: owner.id,
    })
    expect(opened.status).toBe('open')

    const closed = services.trips.closeTrip({
      id: opened.id,
      filledReturned: 20,
      emptiesReturned: 0,
      cashSubmitted: 0,
      userId: owner.id,
    })
    expect(closed.status).toBe('closed')
    expect(closed.cashVariance).toBe(0)

    const other = services.trips.startTrip({
      tripDate: '2026-07-16',
      employeeId: emp.id,
      vehicleId: vehicle.id,
      filledLoaded: 10,
      userId: owner.id,
    })
    const voided = services.trips.voidTrip(other.id, 'Opened by mistake', owner.id)
    expect(voided.status).toBe('void')
  })

  it('cash variance requires a note', async () => {
    const { services, owner } = app
    services.stock.recordOpeningStock({
      date: '2026-07-01',
      bottleState: 'filled',
      quantity: 200,
      userId: owner.id,
    })
    const customer = seedMinimalCustomer(services, owner.id)
    const vehicle = services.vehicles.create({ name: 'Van B', vehicleType: 'van' }, owner.id)
    const emp = services.employees.create(
      { name: 'Driver B', role: 'delivery', joiningDate: '2026-06-01' },
      owner.id,
    )
    const trip = services.trips.startTrip({
      tripDate: '2026-07-15',
      employeeId: emp.id,
      vehicleId: vehicle.id,
      filledLoaded: 20,
      userId: owner.id,
    })
    services.deliveries.upsertDelivery({
      customerId: customer.id,
      date: '2026-07-15',
      quantity: 2,
      cashCollected: Number(toPaisa(120)),
      employeeId: emp.id,
      userId: owner.id,
    })

    expect(() =>
      services.trips.closeTrip({
        id: trip.id,
        filledReturned: 18,
        emptiesReturned: 2,
        cashSubmitted: 0,
        userId: owner.id,
      }),
    ).toThrow(AppError)

    const closed = services.trips.closeTrip({
      id: trip.id,
      filledReturned: 18,
      emptiesReturned: 2,
      cashSubmitted: 0,
      notes: 'Customer paid later',
      userId: owner.id,
    })
    expect(closed.status).toBe('closed')
    expect(closed.cashVariance).not.toBe(0)
  })
})
