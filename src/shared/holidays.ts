/**
 * Pakistan public / bank holidays used to tint month-matrix columns.
 * Fixed national dates plus approximate lunar festival days for nearby years.
 * Owners can still deliver on these days — tint is informational only.
 */
const PAKISTAN_HOLIDAYS = new Set([
  // 2025
  '2025-02-05', // Kashmir Day
  '2025-03-23', // Pakistan Day
  '2025-03-31', // Eid-ul-Fitr (approx)
  '2025-04-01',
  '2025-05-01', // Labour Day
  '2025-06-07', // Eid-ul-Adha (approx)
  '2025-06-08',
  '2025-08-14', // Independence Day
  '2025-09-05', // Eid Milad (approx)
  '2025-11-09', // Iqbal Day
  '2025-12-25', // Quaid-e-Azam Day
  // 2026
  '2026-02-05',
  '2026-03-21', // Eid-ul-Fitr (approx)
  '2026-03-22',
  '2026-03-23',
  '2026-05-01',
  '2026-05-27', // Eid-ul-Adha (approx)
  '2026-05-28',
  '2026-08-14',
  '2026-08-25', // Eid Milad (approx)
  '2026-11-09',
  '2026-12-25',
  // 2027
  '2027-02-05',
  '2027-03-10', // Eid-ul-Fitr (approx)
  '2027-03-11',
  '2027-03-23',
  '2027-05-01',
  '2027-05-17', // Eid-ul-Adha (approx)
  '2027-05-18',
  '2027-08-14',
  '2027-08-15', // Eid Milad (approx)
  '2027-11-09',
  '2027-12-25',
])

export function isPakistanHoliday(date: string): boolean {
  return PAKISTAN_HOLIDAYS.has(date)
}
