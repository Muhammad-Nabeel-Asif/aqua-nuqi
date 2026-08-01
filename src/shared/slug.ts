/** Filesystem-safe slug; keeps Urdu/Arabic letters so names stay readable. */
export function slugifyName(name: string, maxLen = 40): string {
  const cleaned = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '')
  return cleaned || 'customer'
}

export function invoicePdfFileName(opts: {
  invoiceNo: string
  customerCode: string
  customerName: string
}): string {
  const no = opts.invoiceNo.replace(/[^\w.-]+/g, '-')
  const code = opts.customerCode.replace(/[^\w.-]+/g, '-')
  const slug = slugifyName(opts.customerName)
  return `${no}-${code}-${slug}.pdf`
}

/** Salary slip PDF basename: Salary-YYYY-MM-CODE-name.pdf */
export function salarySlipPdfFileName(opts: {
  period: string
  employeeCode: string
  employeeName: string
}): string {
  const code = opts.employeeCode.replace(/[^\w.-]+/g, '-')
  return `Salary-${opts.period}-${code}-${slugifyName(opts.employeeName)}.pdf`
}
