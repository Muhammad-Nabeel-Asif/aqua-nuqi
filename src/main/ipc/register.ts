import { registerAuthHandlers } from './handlers/auth.handlers'
import { registerBackupHandlers } from './handlers/backup.handlers'
import { registerBillingHandlers } from './handlers/billing.handlers'
import { registerCustomerHandlers } from './handlers/customers.handlers'
import { registerDeliveryHandlers } from './handlers/deliveries.handlers'
import { registerDiagnosticsHandlers } from './handlers/diagnostics.handlers'
import { registerMasterDataHandlers } from './handlers/master-data.handlers'
import { registerPaymentHandlers } from './handlers/payments.handlers'
import { registerPdfHandlers } from './handlers/pdf.handlers'
import { registerPeriodHandlers } from './handlers/period.handlers'
import { registerSettingsHandlers } from './handlers/settings.handlers'
import { registerSetupHandlers } from './handlers/setup.handlers'

export function registerAllHandlers(): void {
  registerAuthHandlers()
  registerSettingsHandlers()
  registerPeriodHandlers()
  registerBackupHandlers()
  registerSetupHandlers()
  registerDiagnosticsHandlers()
  registerMasterDataHandlers()
  registerCustomerHandlers()
  registerDeliveryHandlers()
  registerBillingHandlers()
  registerPaymentHandlers()
  registerPdfHandlers()
}
