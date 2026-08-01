import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

type Line = {
  lineNo: number
  lineType: string
  lineDate: string | null
  description: string
  quantity: number
  rate: number
  amount: number
}

type Invoice = {
  invoiceNo: string
  period: string | null
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string | null
  openingBalance: number
  deliveriesQty: number
  deliveriesTotal: number
  chargesTotal: number
  discountTotal: number
  taxTotal: number
  invoiceTotal: number
  totalPayable: number
  bottlesWithCustomerAtIssue: number
  lines: Line[]
  status: string
}

type Business = {
  name: string
  address: string
  phone: string
  phone2: string
  email: string
  bankDetails: string
  taxNumber: string
  logoDataUrl: string | null
  accentColour: string
  footerNote: string
  termsText: string
  showBottleBalance: boolean
  showRateColumn: boolean
  currencySymbol: string
  decimalPlaces: number
}

export type InvoiceTemplateProps = {
  business: Business
  invoice: Invoice
  customer: {
    code: string
    name: string
    addressLine: string | null
    phonePrimary: string | null
    phoneSecondary: string | null
    securityDepositHeld: number
  }
  emptiesReturned: number
  amountInWords: string
  generatedAt: string
}

function sortLines(lines: Line[]): Line[] {
  const deliveries = lines
    .filter((l) => l.lineType === 'delivery')
    .slice()
    .sort((a, b) => (a.lineDate ?? '').localeCompare(b.lineDate ?? '') || a.lineNo - b.lineNo)
  const rest = lines
    .filter((l) => l.lineType !== 'delivery')
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
  return [...deliveries, ...rest]
}

export function InvoiceTemplate({
  business,
  invoice,
  customer,
  emptiesReturned,
  amountInWords,
  generatedAt,
}: InvoiceTemplateProps) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  const lines = sortLines(invoice.lines)
  const accent = business.accentColour

  return (
    <div className="print-root invoice-print mx-auto max-w-[210mm] bg-white text-[9.5px] leading-tight">
      <BusinessHeader
        compact
        business={business}
        rightSlot={
          <div className="text-right leading-snug">
            <div
              className="inline-block px-2 py-0.5 text-xs font-bold tracking-wide text-white"
              style={{ background: accent }}
            >
              INVOICE / BILL
            </div>
            <div className="mt-1 text-xs font-semibold">{invoice.invoiceNo}</div>
            <div>Issue: {fmtDate(invoice.issueDate)}</div>
            <div>Due: {fmtDate(invoice.dueDate)}</div>
            <div>
              Period:{' '}
              {invoice.period
                ? `${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`
                : 'Ad-hoc'}
            </div>
          </div>
        }
      />

      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <div className="border border-slate-200 px-1.5 py-1">
          <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
            Bill to
          </div>
          <div className="customer-name text-xs font-bold leading-snug" lang="ur">
            {customer.name}
          </div>
          <div className="text-slate-600">{customer.code}</div>
          {customer.addressLine ? (
            <div className="mt-0.5 whitespace-pre-line text-slate-600">{customer.addressLine}</div>
          ) : null}
          <div className="mt-0.5 text-slate-600">
            {[customer.phonePrimary, customer.phoneSecondary].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div
          className="border-2 px-1.5 py-1"
          style={{ borderColor: accent, background: `${accent}10` }}
        >
          <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500">
            Summary
          </div>
          <div className="flex justify-between">
            <span>Previous balance</span>
            <span className="num font-medium">{m(invoice.openingBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span>This month&apos;s charges</span>
            <span className="num font-medium">{m(invoice.invoiceTotal)}</span>
          </div>
          <div
            className="mt-1 flex items-end justify-between border-t pt-1"
            style={{ borderColor: accent }}
          >
            <span className="text-xs font-bold">Total payable</span>
            <span className="num text-base font-bold" style={{ color: accent }}>
              {m(invoice.totalPayable)}
            </span>
          </div>
        </div>
      </div>

      <table className="mb-1.5 invoice-lines">
        <thead>
          <tr>
            <th className="w-6">#</th>
            <th className="w-16">Date</th>
            <th>Description</th>
            <th className="num w-12">Units</th>
            {business.showRateColumn ? <th className="num w-16">Rate</th> : null}
            <th className="num w-20">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={`${l.lineNo}-${idx}`}>
              <td>{idx + 1}</td>
              <td>{fmtDate(l.lineDate)}</td>
              <td>{l.description}</td>
              <td className="num">{l.quantity || ''}</td>
              {business.showRateColumn ? <td className="num">{l.rate ? m(l.rate) : ''}</td> : null}
              <td className="num">{m(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <div>
          {business.showBottleBalance ? (
            <div className="border border-slate-200 px-1.5 py-1">
              <div className="mb-0.5 text-[8px] font-semibold uppercase text-slate-500">
                Bottle summary
              </div>
              <div className="flex justify-between">
                <span>Delivered this month</span>
                <span className="num">{invoice.deliveriesQty}</span>
              </div>
              <div className="flex justify-between">
                <span>Empties returned</span>
                <span className="num">{emptiesReturned}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Bottles currently with you</span>
                <span className="num">{invoice.bottlesWithCustomerAtIssue}</span>
              </div>
              <div className="flex justify-between">
                <span>Security deposit held</span>
                <span className="num">{m(customer.securityDepositHeld)}</span>
              </div>
            </div>
          ) : null}
          <div className="mt-1 text-[8px] italic text-slate-600">{amountInWords}</div>
        </div>
        <div className="border border-slate-200 px-1.5 py-1">
          <div className="flex justify-between">
            <span>Total units</span>
            <span className="num">{invoice.deliveriesQty}</span>
          </div>
          <div className="flex justify-between">
            <span>Water charges</span>
            <span className="num">{m(invoice.deliveriesTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Other charges</span>
            <span className="num">{m(invoice.chargesTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="num">{m(invoice.discountTotal)}</span>
          </div>
          {invoice.taxTotal ? (
            <div className="flex justify-between">
              <span>Tax</span>
              <span className="num">{m(invoice.taxTotal)}</span>
            </div>
          ) : null}
          <div className="mt-0.5 flex justify-between border-t pt-0.5 font-semibold">
            <span>This period total</span>
            <span className="num">{m(invoice.invoiceTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Previous balance</span>
            <span className="num">{m(invoice.openingBalance)}</span>
          </div>
          <div
            className="mt-1 flex justify-between border-t-2 pt-1 text-sm font-bold"
            style={{ borderColor: accent, color: accent }}
          >
            <span>TOTAL PAYABLE</span>
            <span className="num">{m(invoice.totalPayable)}</span>
          </div>
        </div>
      </div>

      <div className="mb-1 border border-slate-200 px-1.5 py-1">
        <div className="mb-0.5 text-[8px] font-semibold uppercase text-slate-500">Payment</div>
        {business.bankDetails ? (
          <div className="whitespace-pre-line text-slate-700">{business.bankDetails}</div>
        ) : (
          <div className="text-slate-500">Bank / JazzCash / Easypaisa details in settings.</div>
        )}
        <div className="mt-0.5">Due date: {fmtDate(invoice.dueDate)}</div>
        {business.termsText ? (
          <div className="mt-0.5 text-[8px] text-slate-600">{business.termsText}</div>
        ) : null}
      </div>

      <footer className="border-t pt-1 text-[8px] text-slate-500">
        <div>{business.footerNote}</div>
        <div className="mt-0.5 flex justify-between">
          <span>This is a computer-generated invoice</span>
          <span>Generated {fmtTs(generatedAt)}</span>
        </div>
        {/* Page x of y is injected by Electron printToPDF footerTemplate (body counters are unsupported). */}
      </footer>

      <style>{`
        @page { size: A4; margin: 8mm 10mm 14mm 10mm; }
        .invoice-print .invoice-lines th,
        .invoice-print .invoice-lines td {
          padding: 1px 4px;
          font-size: 9px;
        }
      `}</style>
    </div>
  )
}
