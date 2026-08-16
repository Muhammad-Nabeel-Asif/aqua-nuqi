import type { ZodError } from 'zod'

const FIELD_LABELS: Record<string, string> = {
  whatsappNumber: 'WhatsApp',
  phonePrimary: 'Primary phone',
  phoneSecondary: 'Secondary phone',
  email: 'Email',
}

/** First Zod issue as a sentence a plant owner can act on. */
export function zodErrorMessage(error: ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Please check what you entered'
  const field = issue.path.length ? String(issue.path[issue.path.length - 1]) : ''
  const label = FIELD_LABELS[field]
  if (label) return `${label}: ${issue.message}`
  return issue.message || 'Please check what you entered'
}
