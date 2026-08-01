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
  compact = false,
}: {
  business: Business
  rightSlot?: React.ReactNode
  /** Denser header for typical one-page invoices. */
  compact?: boolean
}) {
  const logoBox = compact ? 'h-10 w-10' : 'h-14 w-14'
  return (
    <header
      className={`flex items-start justify-between gap-3 border-b-2 ${compact ? 'mb-1.5 pb-1.5' : 'mb-3 pb-3'}`}
      style={{ borderColor: business.accentColour }}
    >
      <div className="flex items-start gap-2">
        {business.logoDataUrl ? (
          <img src={business.logoDataUrl} alt="" className={`${logoBox} object-contain`} />
        ) : (
          <div
            className={`flex ${logoBox} items-center justify-center font-bold text-white ${compact ? 'text-base' : 'text-lg'}`}
            style={{ background: business.accentColour }}
          >
            {business.name.slice(0, 1) || 'A'}
          </div>
        )}
        <div>
          <div
            className={`font-bold ${compact ? 'text-base' : 'text-xl'}`}
            style={{ color: business.accentColour }}
          >
            {business.name}
          </div>
          {business.address ? (
            <div
              className={`max-w-xs whitespace-pre-line text-slate-600 ${compact ? 'text-[9px] leading-snug' : 'text-xs'}`}
            >
              {business.address}
            </div>
          ) : null}
          <div className={`mt-0.5 text-slate-600 ${compact ? 'text-[9px]' : 'text-xs'}`}>
            {[business.phone, business.phone2].filter(Boolean).join(' · ')}
            {business.email ? ` · ${business.email}` : ''}
          </div>
          {business.taxNumber ? (
            <div className={`text-slate-500 ${compact ? 'text-[9px]' : 'text-xs'}`}>
              NTN / Tax: {business.taxNumber}
            </div>
          ) : null}
        </div>
      </div>
      {rightSlot}
    </header>
  )
}
