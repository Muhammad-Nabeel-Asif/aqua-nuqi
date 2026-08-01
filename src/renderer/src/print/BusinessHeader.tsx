type Business = {
  name: string
  address: string
  phone: string
  phone2?: string
  email: string
  logoDataUrl: string | null
  accentColour: string
  taxNumber?: string
}

export function BusinessHeader({
  business,
  rightSlot,
}: {
  business: Business
  rightSlot?: React.ReactNode
}) {
  return (
    <header
      className="mb-3 flex items-start justify-between gap-4 border-b-2 pb-3"
      style={{ borderColor: business.accentColour }}
    >
      <div className="flex items-start gap-3">
        {business.logoDataUrl ? (
          <img src={business.logoDataUrl} alt="" className="h-14 w-14 object-contain" />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center text-lg font-bold text-white"
            style={{ background: business.accentColour }}
          >
            {business.name.slice(0, 1) || 'A'}
          </div>
        )}
        <div>
          <div className="text-xl font-bold" style={{ color: business.accentColour }}>
            {business.name}
          </div>
          {business.address ? (
            <div className="max-w-xs whitespace-pre-line text-xs text-slate-600">
              {business.address}
            </div>
          ) : null}
          <div className="mt-1 text-xs text-slate-600">
            {[business.phone, business.phone2].filter(Boolean).join(' · ')}
            {business.email ? ` · ${business.email}` : ''}
          </div>
          {business.taxNumber ? (
            <div className="text-xs text-slate-500">NTN / Tax: {business.taxNumber}</div>
          ) : null}
        </div>
      </div>
      {rightSlot}
    </header>
  )
}
