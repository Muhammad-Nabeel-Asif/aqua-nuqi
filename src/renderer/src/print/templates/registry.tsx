import type { PrintTemplateId } from '@shared/contracts/pdf'
import { BottlesOutTemplate } from './BottlesOutTemplate'
import { DeliveryCardTemplate } from './DeliveryCardTemplate'
import { DeliverySlipTemplate } from './DeliverySlipTemplate'
import { InvoiceTemplate } from './InvoiceTemplate'
import { PaymentReceiptTemplate } from './PaymentReceiptTemplate'
import { ReceivablesTemplate } from './ReceivablesTemplate'
import { StatementTemplate } from './StatementTemplate'
import { TableExportTemplate } from './TableExportTemplate'

/** Template registry — map print template ids to React components. */
export const PRINT_TEMPLATE_REGISTRY: Record<
  PrintTemplateId,
  (payload: Record<string, unknown>) => React.ReactNode
> = {
  invoice: (p) => <InvoiceTemplate {...(p as Parameters<typeof InvoiceTemplate>[0])} />,
  'payment-receipt-a5': (p) => (
    <PaymentReceiptTemplate
      variant="a5"
      business={p.business as Parameters<typeof PaymentReceiptTemplate>[0]['business']}
      payment={p.payment as Parameters<typeof PaymentReceiptTemplate>[0]['payment']}
      balanceAfter={Number(p.balanceAfter ?? 0)}
      amountInWords={String(p.amountInWords ?? '')}
      receivedBy={String(p.receivedBy ?? '')}
      generatedAt={String(p.generatedAt ?? '')}
    />
  ),
  'payment-receipt-thermal': (p) => (
    <PaymentReceiptTemplate
      variant="thermal"
      business={p.business as Parameters<typeof PaymentReceiptTemplate>[0]['business']}
      payment={p.payment as Parameters<typeof PaymentReceiptTemplate>[0]['payment']}
      balanceAfter={Number(p.balanceAfter ?? 0)}
      amountInWords={String(p.amountInWords ?? '')}
      receivedBy={String(p.receivedBy ?? '')}
      generatedAt={String(p.generatedAt ?? '')}
    />
  ),
  'delivery-slip': (p) => (
    <DeliverySlipTemplate {...(p as Parameters<typeof DeliverySlipTemplate>[0])} />
  ),
  'customer-statement': (p) => (
    <StatementTemplate {...(p as Parameters<typeof StatementTemplate>[0])} />
  ),
  'delivery-card': (p) => (
    <DeliveryCardTemplate {...(p as Parameters<typeof DeliveryCardTemplate>[0])} />
  ),
  'bottles-out': (p) => <BottlesOutTemplate {...(p as Parameters<typeof BottlesOutTemplate>[0])} />,
  receivables: (p) => <ReceivablesTemplate {...(p as Parameters<typeof ReceivablesTemplate>[0])} />,
  'table-export': (p) => (
    <TableExportTemplate {...(p as Parameters<typeof TableExportTemplate>[0])} />
  ),
}

export const PRINT_TEMPLATE_IDS = Object.keys(PRINT_TEMPLATE_REGISTRY) as PrintTemplateId[]
