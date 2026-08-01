import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

type Entry = {
  entryDate: string
  entryType: string
  description: string
  debit: number
  credit: number
  balanceAfter: number
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
  customer: {
    code: string
    name: string
    addressLine: string | null
    phonePrimary: string | null
  }
  from: string | null
  to: string | null
  openingBalance: number
  closingBalance: number
  entries: Entry[]
  generatedAt: string
}

export function StatementTemplate({
  business,
  customer,
  from,
  to,
  openingBalance,
  closingBalance,
  entries,
  generatedAt,
}: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-2 text-[11px]">
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right">
            <div className="font-bold" style={{ color: business.accentColour }}>
              CUSTOMER STATEMENT
            </div>
            <div>
              {from ? fmtDate(from) : '…'} – {to ? fmtDate(to) : '…'}
            </div>
          </div>
        }
      />
      <div className="mb-3">
        <div className="customer-name text-sm font-bold" lang="ur">
          {customer.name}
        </div>
        <div>
          {customer.code}
          {customer.phonePrimary ? ` · ${customer.phonePrimary}` : ''}
        </div>
        {customer.addressLine ? <div className="text-slate-600">{customer.addressLine}</div> : null}
      </div>
      <div className="mb-2 flex justify-between font-semibold">
        <span>Opening balance: {m(openingBalance)}</span>
        <span>Closing balance: {m(closingBalance)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{fmtDate(e.entryDate)}</td>
              <td>{e.entryType}</td>
              <td>{e.description}</td>
              <td className="num">{e.debit ? m(e.debit) : ''}</td>
              <td className="num">{e.credit ? m(e.credit) : ''}</td>
              <td className="num">{m(e.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[9px] text-slate-500">Generated {fmtTs(generatedAt)}</div>
    </div>
  )
}
