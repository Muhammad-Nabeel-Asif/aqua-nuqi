import { BusinessHeader } from '../BusinessHeader'
import { fmtMoney, fmtTs } from '../format'

type Day = {
  day: number
  quantity: number | null
  emptiesCollected: number | null
  amount: number | null
}

type Props = {
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
  card: {
    code: string
    name: string
    period: string
    rate: number
    days: Day[]
    totalUnits: number
    totalAmount: number
    totalEmpties: number
    bottlesWithCustomer: number
  }
  generatedAt: string
}

export function DeliveryCardTemplate({ business, card, generatedAt }: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-2 text-[11px]">
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right font-bold" style={{ color: business.accentColour }}>
            MONTHLY DELIVERY CARD
            <div className="font-normal">{card.period}</div>
          </div>
        }
      />
      <div className="mb-2 flex justify-between">
        <div>
          <div className="customer-name text-sm font-bold" lang="ur">
            {card.name}
          </div>
          <div>
            {card.code} · Rate {m(card.rate)}
          </div>
        </div>
        <div className="text-right">
          <div>Total units: {card.totalUnits}</div>
          <div>Empties: {card.totalEmpties}</div>
          <div>Amount: {m(card.totalAmount)}</div>
          <div>Bottles with customer: {card.bottlesWithCustomer}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th className="num">Qty</th>
            <th className="num">Empties</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {card.days.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td className="num">{d.quantity ?? ''}</td>
              <td className="num">{d.emptiesCollected ?? ''}</td>
              <td className="num">{d.amount != null ? m(d.amount) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[9px] text-slate-500">Generated {fmtTs(generatedAt)}</div>
    </div>
  )
}
