import { BusinessHeader } from '../BusinessHeader'
import { fmtTs } from '../format'

type Col = { key: string; header: string; align?: 'left' | 'right' | 'center' }

type Props = {
  business: {
    name: string
    address: string
    phone: string
    phone2: string
    email: string
    logoDataUrl: string | null
    accentColour: string
  }
  title: string
  columns: Col[]
  rows: Array<Record<string, string | number | null>>
  filters: Array<{ label: string; value: string }>
  generatedAt: string
}

export function TableExportTemplate({
  business,
  title,
  columns,
  rows,
  filters,
  generatedAt,
}: Props) {
  return (
    <div className="print-root mx-auto max-w-[297mm] bg-white p-2 text-[10px]">
      <BusinessHeader
        business={business}
        rightSlot={
          <div className="text-right font-bold" style={{ color: business.accentColour }}>
            {title}
          </div>
        }
      />
      {filters.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-3 text-slate-600">
          {filters.map((f) => (
            <span key={f.label}>
              {f.label}: <strong>{f.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.align === 'right' ? 'num' : c.align === 'center' ? 'text-center' : ''}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={
                    c.align === 'right' ? 'num' : c.align === 'center' ? 'text-center' : ''
                  }
                >
                  {row[c.key] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[9px] text-slate-500">
        {rows.length} rows · Generated {fmtTs(generatedAt)}
      </div>
    </div>
  )
}
