import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

type Props = {
  variant: 'a5' | 'thermal'
  business: {
    name: string
    address: string
    phone: string
    phone2: string
    email: string
    logoDataUrl: string | null
    accentColour: string
    currencySymbol: string
    decimalPlaces: number
  }
  payment: {
    receiptNo: string | null
    paymentDate: string
    customerCode: string
    customerName: string
    amount: number
    method: string
    referenceNo: string | null
  }
  balanceAfter: number
  amountInWords: string
  receivedBy: string
  generatedAt: string
}

export function PaymentReceiptTemplate({
  variant,
  business,
  payment,
  balanceAfter,
  amountInWords,
  receivedBy,
  generatedAt,
}: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  const thermal = variant === 'thermal'

  return (
    <div
      className={`print-root bg-white ${thermal ? 'w-[72mm] p-1 text-[10px]' : 'mx-auto max-w-[148mm] p-3 text-[11px]'}`}
    >
      {!thermal ? (
        <BusinessHeader
          business={business}
          rightSlot={
            <div className="text-right font-bold" style={{ color: business.accentColour }}>
              PAYMENT RECEIPT
            </div>
          }
        />
      ) : (
        <div className="mb-2 text-center">
          <div className="font-bold" style={{ color: business.accentColour }}>
            {business.name}
          </div>
          <div className="text-[9px]">{business.phone}</div>
          <div className="mt-1 font-semibold">PAYMENT RECEIPT</div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Receipt</span>
          <span className="font-semibold">{payment.receiptNo ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{fmtDate(payment.paymentDate)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Customer</span>
          <span className="customer-name text-right font-semibold" lang="ur">
            {payment.customerCode} — {payment.customerName}
          </span>
        </div>
        <div className="my-2 border-y py-2 text-center">
          <div className="text-[9px] uppercase text-slate-500">Amount received</div>
          <div className="num text-lg font-bold" style={{ color: business.accentColour }}>
            {m(payment.amount)}
          </div>
          <div className="mt-1 text-[9px] italic">{amountInWords}</div>
        </div>
        <div className="flex justify-between">
          <span>Method</span>
          <span className="capitalize">{payment.method.replace(/_/g, ' ')}</span>
        </div>
        {payment.referenceNo ? (
          <div className="flex justify-between">
            <span>Reference</span>
            <span>{payment.referenceNo}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>Balance after</span>
          <span className="num font-semibold">{m(balanceAfter)}</span>
        </div>
        <div className="mt-4 flex justify-between">
          <span>Received by: {receivedBy || '______________'}</span>
        </div>
        <div className="mt-6 border-t pt-2 text-center text-[9px]">Signature ________________</div>
        <div className="mt-2 text-center text-[8px] text-slate-500">
          Generated {fmtTs(generatedAt)}
        </div>
      </div>
    </div>
  )
}
