import type { AppDatabase, RawDatabase } from '@main/db/client'
import type { AppPaths } from '@main/lib/paths'
import type { AuditService } from '@main/services/audit.service'
import type { AuthService } from '@main/services/auth.service'
import type { BackupService } from '@main/services/backup.service'
import type { BalanceService } from '@main/services/balance.service'
import type { CustomerImportService } from '@main/services/customer-import.service'
import type { CustomerService } from '@main/services/customer.service'
import type { DeliveryService } from '@main/services/delivery.service'
import type { MasterDataService } from '@main/services/master-data.service'
import type { PeriodService } from '@main/services/period.service'
import type { RateService } from '@main/services/rate.service'
import type { SettingsService } from '@main/services/settings.service'

export type BootFatal =
  | { type: 'fatal_path'; message: string }
  | { type: 'app_older_than_data'; schemaVersion: number; bundledMax: number; appVersion: string }
  | { type: 'migration_failed'; message: string; backupPath?: string }

export type AppContext = {
  paths: AppPaths
  db: AppDatabase
  raw: RawDatabase
  auth: AuthService
  settings: SettingsService
  audit: AuditService
  period: PeriodService
  backup: BackupService
  masterData: MasterDataService
  rates: RateService
  balances: BalanceService
  customers: CustomerService
  customerImport: CustomerImportService
  deliveries: DeliveryService
  appVersion: string
  schemaVersion: number
  setupRequired: boolean
  bootFatal: BootFatal | null
}

let ctx: AppContext | null = null

export function setAppContext(next: AppContext): void {
  ctx = next
}

export function getAppContext(): AppContext {
  if (!ctx) throw new Error('App context not initialised')
  return ctx
}

export function tryGetAppContext(): AppContext | null {
  return ctx
}
