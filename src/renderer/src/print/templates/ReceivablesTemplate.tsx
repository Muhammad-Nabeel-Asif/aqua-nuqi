import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

type Row = {
  code: string
  name: string
  phone: string | null
  areaName: string | null
  routeName: string | null
  balance: number
  daysOverdue: number
  ageingBucket: string
  lastPaymentDate: string | null
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
  report: {
    asOf: string
    outstanding: Row[]
    inCredit: Row[]
    totalOutstanding: number
    totalCredit: number
    bucketTotals: Record<string, number>
  }
  generatedAt: string
}

export function ReceivablesTemplate({ business, report, generatedAt }: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  return (
    <div className="print-root mx-auto max-w-[297mm] bg-white p-2 text-[10px]">
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right">
            <div className="font-bold" style={{ color: business.accentColour }}>
              RECEIVABLES
            </div>
            <div>As of {fmtDate(report.asOf)}</div>
          </div>
        }
      />
      <div className="mb-2 flex gap-4 font-semibold">
        <span>Outstanding: {m(report.totalOutstanding)}</span>
        <span>Credit: {m(report.totalCredit)}</span>
        {Object.entries(report.bucketTotals).map(([k, v]) => (
          <span key={k}>
            {k}: {m(v)}
          </span>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>Area / Route</th>
            <th className="num">Balance</th>
            <th className="num">Days overdue</th>
            <th>Bucket</th>
            <th>Last payment</th>
          </tr>
        </thead>
        <tbody>
          {report.outstanding.map((r) => (
            <tr key={r.code}>
              <td>{r.code}</td>
              <td className="customer-name" lang="ur">
                {r.name}
              </td>
              <td>{r.phone ?? ''}</td>
              <td>{[r.areaName, r.routeName].filter(Boolean).join(' / ')}</td>
              <td className="num">{m(r.balance)}</td>
              <td className="num">{r.daysOverdue}</td>
              <td>{r.ageingBucket}</td>
              <td>{fmtDate(r.lastPaymentDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[9px] text-slate-500">Generated {fmtTs(generatedAt)}</div>
    </div>
  )
}
