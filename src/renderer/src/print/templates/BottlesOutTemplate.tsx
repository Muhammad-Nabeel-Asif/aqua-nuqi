import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

type Row = {
  code: string
  name: string
  areaName: string | null
  routeName: string | null
  bottlesWithCustomer: number
  securityDepositHeld: number
  lastDeliveryDate: string | null
  daysSinceLastReturn: number | null
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
  report: { items: Row[] }
  generatedAt: string
}

export function BottlesOutTemplate({ business, report, generatedAt }: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  return (
    <div className="print-root mx-auto max-w-[297mm] bg-white p-2 text-[10px]">
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right font-bold" style={{ color: business.accentColour }}>
            BOTTLES WITH CUSTOMERS
          </div>
        }
      />
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Customer</th>
            <th>Area</th>
            <th>Route</th>
            <th className="num">Bottles</th>
            <th className="num">Deposit held</th>
            <th>Last delivery</th>
            <th className="num">Days since return</th>
          </tr>
        </thead>
        <tbody>
          {report.items.map((r) => (
            <tr key={r.code}>
              <td>{r.code}</td>
              <td className="customer-name" lang="ur">
                {r.name}
              </td>
              <td>{r.areaName ?? ''}</td>
              <td>{r.routeName ?? ''}</td>
              <td className="num">{r.bottlesWithCustomer}</td>
              <td className="num">{m(r.securityDepositHeld)}</td>
              <td>{fmtDate(r.lastDeliveryDate)}</td>
              <td className="num">{r.daysSinceLastReturn ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[9px] text-slate-500">
        {report.items.length} customers · Generated {fmtTs(generatedAt)}
      </div>
    </div>
  )
}
