import { fmtDate, fmtMoney, fmtTs } from '../format'

type Props = {
  business: {
    name: string
    phone: string
    accentColour: string
    currencySymbol: string
    decimalPlaces: number
  }
  delivery: {
    deliveryDate: string
    quantity: number
    emptiesCollected: number
    rate: number
    amount: number
  }
  customer: { code: string; name: string; phonePrimary: string | null }
  runningBalance: number
  generatedAt: string
}

export function DeliverySlipTemplate({
  business,
  delivery,
  customer,
  runningBalance,
  generatedAt,
}: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  return (
    <div className="print-root w-[72mm] bg-white p-1 text-[10px]">
      <div className="mb-2 text-center">
        <div className="font-bold" style={{ color: business.accentColour }}>
          {business.name}
        </div>
        <div className="text-[9px]">{business.phone}</div>
        <div className="mt-1 font-semibold">DELIVERY SLIP</div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Date</span>
          <span>{fmtDate(delivery.deliveryDate)}</span>
        </div>
        <div className="customer-name font-semibold" lang="ur">
          {customer.code} — {customer.name}
        </div>
        {customer.phonePrimary ? <div>{customer.phonePrimary}</div> : null}
        <div className="my-2 border-y py-1">
          <div className="flex justify-between">
            <span>Units delivered</span>
            <span className="num font-semibold">{delivery.quantity}</span>
          </div>
          <div className="flex justify-between">
            <span>Empties taken</span>
            <span className="num">{delivery.emptiesCollected}</span>
          </div>
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="num">{m(delivery.rate)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Amount</span>
            <span className="num">{m(delivery.amount)}</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span>Running balance</span>
          <span className="num font-semibold">{m(runningBalance)}</span>
        </div>
        <div className="mt-3 text-center text-[8px] text-slate-500">{fmtTs(generatedAt)}</div>
      </div>
    </div>
  )
}
