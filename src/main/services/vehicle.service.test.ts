import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeAndRm, openTestApp, type TestApp } from '@main/test/harness'
import { AppError } from '@shared/errors'

describe('vehicleService CRUD', () => {
  let app: TestApp

  beforeEach(async () => {
    app = await openTestApp('aqua-vehicle-')
  })

  afterEach(() => {
    closeAndRm(app)
  })

  it('creates, updates, deactivates, and lists', async () => {
    const { services, owner } = app
    const created = services.vehicles.create(
      {
        name: 'Mazda',
        vehicleType: 'van',
        registrationNo: 'LEA-123',
        capacityBottles: 80,
      },
      owner.id,
    )
    expect(created.name).toBe('Mazda')
    expect(created.isActive).toBe(true)

    const updated = services.vehicles.update(
      { id: created.id, name: 'Mazda 2', capacityBottles: 90 },
      owner.id,
    )
    expect(updated.name).toBe('Mazda 2')
    expect(updated.capacityBottles).toBe(90)

    services.vehicles.update({ id: created.id, isActive: false }, owner.id)
    expect(services.vehicles.list().items.find((v) => v.id === created.id)).toBeUndefined()
    expect(services.vehicles.list(true).items.some((v) => v.id === created.id)).toBe(true)
  })

  it('rejects an empty name', async () => {
    const { services, owner } = app
    expect(() => services.vehicles.create({ name: '  ' }, owner.id)).toThrow(AppError)
  })
})
