/**
 * Normalise a Pakistan mobile for wa.me links (E.164 without '+').
 * `03001234567` → `923001234567`
 */
export function toWhatsAppE164(phone: string, countryCode = '92'): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith(countryCode)) return digits
  if (digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`
  return digits
}
