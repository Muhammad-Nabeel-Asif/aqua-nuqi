import { eq } from 'drizzle-orm'
import { newUuid } from '@main/lib/ids'
import { nowIsoUtc } from '@shared/date'
import { SETTING_DEFAULTS } from '@shared/settings-keys'
import type { AppDatabase } from './client'
import { expenseCategories, products, settings } from './schema'

const EXPENSE_CATEGORY_NAMES = [
  'Electricity',
  'Raw water',
  'Fuel',
  'Vehicle maintenance',
  'Bottle purchase',
  'Caps & seals',
  'Filter / RO membrane',
  'Plant maintenance & repairs',
  'Rent',
  'Salaries',
  'Employee Advance',
  'Licence & government fees',
  'Mobile & internet',
  'Marketing',
  'Miscellaneous',
] as const

const SYSTEM_CATEGORIES = new Set(['Salaries', 'Employee Advance'])

export function seedDefaults(db: AppDatabase, backupFolderDefault: string): void {
  const now = nowIsoUtc()

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const existing = db.select().from(settings).where(eq(settings.key, key)).get()
    if (existing) continue
    const stored = key === 'backup.folder' && value === '' ? backupFolderDefault : value
    db.insert(settings)
      .values({
        key,
        value: JSON.stringify(stored),
        updatedAt: now,
      })
      .run()
  }

  const defaultProduct = db.select().from(products).where(eq(products.isDefault, 1)).get()
  if (!defaultProduct) {
    db.insert(products)
      .values({
        uuid: newUuid(),
        name: '19 L Bottle',
        sku: 'BOTTLE-19L',
        sizeLiters: 19,
        kind: 'returnable_bottle',
        isReturnable: 1,
        defaultRate: 0,
        defaultDeposit: 0,
        trackStock: 1,
        isDefault: 1,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  EXPENSE_CATEGORY_NAMES.forEach((name, index) => {
    const existing = db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.name, name))
      .get()
    if (existing) return
    db.insert(expenseCategories)
      .values({
        uuid: newUuid(),
        name,
        isSystem: SYSTEM_CATEGORIES.has(name) ? 1 : 0,
        sortOrder: index,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  })
}
