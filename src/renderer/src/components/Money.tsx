import { cn } from '@renderer/lib/utils'
import { formatMoney, type Paisa } from '@shared/money'

type Props = {
  value: number | null
  className?: string
  creditSuffix?: boolean
}

export function Money({ value, className, creditSuffix }: Props) {
  if (value === null) {
    return <span className={cn('tabular-nums text-right', className)}>—</span>
  }

  const paisa = value as Paisa
  const formatted = formatMoney(paisa)
  const isCredit = value < 0
  const isOverdue = value > 0 && creditSuffix === false

  return (
    <span
      className={cn(
        'tabular-nums text-right',
        isCredit && 'text-success',
        isOverdue && 'text-destructive',
        className,
      )}
    >
      {isCredit && creditSuffix ? `${formatMoney(-value as Paisa)} CR` : formatted}
    </span>
  )
}
