/**
 * Branded header for 80 mm thermal documents (delivery slips, cash receipts).
 *
 * A4 documents use `BusinessHeader`; a roll is only ~72 mm of printable width,
 * so this is a centred, stacked variant with a deliberately small logo. Thermal
 * printers are one-bit and low DPI, which is why the mark is capped at ~10 mm
 * and the address is dropped entirely.
 */

type ThermalBusiness = {
  name: string
  phone: string
  accentColour: string
  logoDataUrl?: string | null
}

export function ThermalBrandHeader({
  business,
  title,
}: {
  business: ThermalBusiness
  title: string
}) {
  return (
    <div className="mb-2 text-center">
      {business.logoDataUrl ? (
        <img
          src={business.logoDataUrl}
          alt=""
          className="mx-auto mb-1 max-h-[10mm] w-auto object-contain"
        />
      ) : null}
      <div className="font-bold" style={{ color: business.accentColour }}>
        {business.name}
      </div>
      {business.phone ? <div className="text-[9px]">{business.phone}</div> : null}
      <div className="mt-1 font-semibold">{title}</div>
    </div>
  )
}
