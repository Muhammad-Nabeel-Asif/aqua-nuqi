import type { PayrollItemDto } from '@shared/contracts'
import { BusinessHeader } from '../BusinessHeader'
import { fmtDate, fmtMoney, fmtTs } from '../format'

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
  period: string
  workingDaysBasis: string
  employee: {
    code: string
    name: string
    role: string
    joiningDate: string | null
  }
  item: PayrollItemDto
  amountInWords: string
  generatedAt: string
}

export function SalarySlipTemplate({
  business,
  period,
  workingDaysBasis,
  employee,
  item,
  amountInWords,
  generatedAt,
}: Props) {
  const m = (p: number) => fmtMoney(p, business.currencySymbol, business.decimalPlaces)
  const basisLabel =
    workingDaysBasis === 'fixed_26'
      ? 'Fixed 26 days'
      : workingDaysBasis === 'calendar'
        ? 'Calendar days'
        : 'Working days (excl. holidays)'

  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-6 text-[12px] text-slate-900">
      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right font-bold" style={{ color: business.accentColour }}>
            SALARY SLIP
            <div className="text-sm font-normal text-slate-600">{period}</div>
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-200 py-3">
        <div>
          <div className="font-semibold">{employee.name}</div>
          <div className="text-slate-600">
            {employee.code} · {employee.role}
          </div>
          {employee.joiningDate ? (
            <div className="text-slate-500">Joined {fmtDate(employee.joiningDate)}</div>
          ) : null}
        </div>
        <div className="text-right text-slate-600">
          <div>Working days: {item.workingDays}</div>
          <div>Basis: {basisLabel}</div>
          <div>
            Present {item.daysPresent} · Absent {item.daysAbsent}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1">Earnings</th>
            <th className="py-1 text-right tabular-nums">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1">Base</td>
            <td className="py-1 text-right tabular-nums">{m(item.baseAmount)}</td>
          </tr>
          <tr>
            <td className="py-1">Commission ({item.bottlesDelivered} bottles)</td>
            <td className="py-1 text-right tabular-nums">{m(item.commissionAmount)}</td>
          </tr>
          <tr>
            <td className="py-1">Overtime ({item.overtimeHours} h)</td>
            <td className="py-1 text-right tabular-nums">{m(item.overtimeAmount)}</td>
          </tr>
          <tr>
            <td className="py-1">Bonus</td>
            <td className="py-1 text-right tabular-nums">{m(item.bonusAmount)}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1">Deductions</th>
            <th className="py-1 text-right tabular-nums">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1">Absence</td>
            <td className="py-1 text-right tabular-nums">{m(item.absenceDeduction)}</td>
          </tr>
          <tr>
            <td className="py-1">Advances</td>
            <td className="py-1 text-right tabular-nums">{m(item.advancesDeducted)}</td>
          </tr>
          <tr>
            <td className="py-1">Other{item.deductionNotes ? ` — ${item.deductionNotes}` : ''}</td>
            <td className="py-1 text-right tabular-nums">{m(item.otherDeductions)}</td>
          </tr>
        </tbody>
      </table>

      <div
        className="mt-4 flex items-center justify-between border-t-2 pt-3 text-base font-bold"
        style={{ borderColor: business.accentColour }}
      >
        <span>Net paid</span>
        <span className="tabular-nums">{m(item.netPayable)}</span>
      </div>
      <div className="mt-1 text-slate-600">{amountInWords}</div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-slate-600">
        <div>Payment date: {item.paymentDate ? fmtDate(item.paymentDate) : '—'}</div>
        <div className="text-right">Method: {item.paymentMethod ?? '—'}</div>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-8">
        <div className="border-t border-slate-400 pt-1 text-center text-slate-500">
          Employee signature
        </div>
        <div className="border-t border-slate-400 pt-1 text-center text-slate-500">
          Authorised signature
        </div>
      </div>

      <div className="mt-6 text-[10px] text-slate-400">Generated {fmtTs(generatedAt)}</div>
    </div>
  )
}
