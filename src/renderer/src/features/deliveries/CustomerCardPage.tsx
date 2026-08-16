import { useParams } from 'react-router-dom'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { currentPeriod } from '@shared/date'
import { CustomerCardView } from './CustomerCardView'

export function CustomerCardPage() {
  const id = Number(useParams().id)
  const period = useParams().period ?? currentPeriod()
  return (
    <div>
      <PageHeader
        title="Monthly delivery card"
        subtitle="Same as the paper delivery card"
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void api.pdf
                .generateDeliveryCard(id, period, true)
                .then((r) =>
                  toast({ title: 'Card PDF saved', description: r.path, variant: 'success' }),
                )
                .catch((e) =>
                  toast({
                    title: 'PDF failed',
                    description: e instanceof Error ? e.message : 'Error',
                    variant: 'error',
                  }),
                )
            }
          >
            Print PDF
          </Button>
        }
      />
      <CustomerCardView customerId={id} period={period} />
    </div>
  )
}
