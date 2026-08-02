import { formatDisplayDate, formatDisplayDateTime, resolveDisplayDateKind } from '@shared/date'

type Props = {
  value: string
  kind?: 'date' | 'datetime'
  className?: string
}

export function DateText({ value, kind = 'date', className }: Props) {
  const resolved = resolveDisplayDateKind(value, kind)
  const text = resolved === 'datetime' ? formatDisplayDateTime(value) : formatDisplayDate(value)
  return <span className={className}>{text}</span>
}
