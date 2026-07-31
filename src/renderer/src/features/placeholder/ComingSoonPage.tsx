import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { t } from '@renderer/lib/i18n'

export function ComingSoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        title={t('empty.comingSoon', { phase })}
        description="This screen is registered so navigation can be tested. It will be built in a later phase."
      />
    </div>
  )
}
