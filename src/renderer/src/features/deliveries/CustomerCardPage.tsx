import { useParams } from 'react-router-dom'
import { PageHeader } from '@renderer/components/PageHeader'
import { currentPeriod } from '@shared/date'
import { CustomerCardView } from './CustomerCardView'

export function CustomerCardPage() {
  const id = Number(useParams().id)
  const period = useParams().period ?? currentPeriod()
  return (
    <div>
      <PageHeader title="Monthly delivery card" subtitle="Paper-card digital twin" />
      <CustomerCardView customerId={id} period={period} />
    </div>
  )
}
