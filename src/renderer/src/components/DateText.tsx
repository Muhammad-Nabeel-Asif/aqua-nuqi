import { formatDisplayDate, formatDisplayDateTime } from '@shared/date'

type Props = {
  value: string
  kind?: 'date' | 'datetime'
  className?: string
}

export function DateText({ value, kind = 'date', className }: Props) {
  const text = kind === 'datetime' ? formatDisplayDateTime(value) : formatDisplayDate(value)
  return <span className={className}>{text}</span>
}
