import { toPaisa } from '@shared/money'
import type { TestServices } from './harness'

export const MINIMAL_JOINED_ON = '2026-06-01'
export const MINIMAL_RATE_RS = 60

export function seedMinimalCustomer(
  services: TestServices,
  ownerId: number,
  opts?: { name?: string; rateRs?: number; joinedOn?: string; openingBalance?: number },
) {
  return services.customers.create(
    {
      name: opts?.name ?? 'Test Customer',
      rate: Number(toPaisa(opts?.rateRs ?? MINIMAL_RATE_RS)),
      joinedOn: opts?.joinedOn ?? MINIMAL_JOINED_ON,
      openingAsOf: opts?.joinedOn ?? MINIMAL_JOINED_ON,
      openingBalance: opts?.openingBalance ?? 0,
    },
    ownerId,
  )
}
