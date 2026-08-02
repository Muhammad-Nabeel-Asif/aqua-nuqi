import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useSessionStore } from '@renderer/stores/session'

const STEPS = [
  {
    title: 'Enter today’s deliveries',
    body: "Open Deliveries → Daily entry each evening and type units from the drivers' slips.",
    to: '/deliveries',
  },
  {
    title: 'Add a customer',
    body: 'Customers hold rates, bottle balances, and billing. Start here when a new account opens.',
    to: '/customers',
  },
  {
    title: 'Generate bills',
    body: 'At month end, Billing → Generate bills, then close the period so history stays fixed.',
    to: '/billing',
  },
  {
    title: 'Record an expense',
    body: 'Track cash and bank outgoings under Expenses so profit reports stay honest.',
    to: '/expenses',
  },
  {
    title: 'Check backups',
    body: 'Settings → Backup. Keep a secondary folder on USB or Drive sync. The red chip means overdue.',
    to: '/settings/backup',
  },
] as const

export function OnboardingTour() {
  const user = useSessionStore((s) => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)

  const settingsQuery = useQuery({
    queryKey: ['settings', 'onboarding'],
    enabled: user?.role === 'owner',
    queryFn: () => api.settings.get({ keys: ['onboarding.tourCompleted'] }),
  })

  const completed = Boolean(settingsQuery.data?.values['onboarding.tourCompleted'])
  if (user?.role !== 'owner' || settingsQuery.isLoading || completed) return null

  const current = STEPS[step]!

  async function finish() {
    await api.settings.setMany({ values: { 'onboarding.tourCompleted': true } })
    await qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
          First-run tour · {step + 1} / {STEPS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-sky-950">{current.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{current.body}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => void finish()}>
            Skip
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigate(current.to)
            }}
          >
            Open screen
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button onClick={() => void finish()}>Done</Button>
          )}
        </div>
      </div>
    </div>
  )
}
