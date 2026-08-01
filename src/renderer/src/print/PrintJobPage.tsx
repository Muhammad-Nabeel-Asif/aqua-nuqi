import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import type { PrintTemplateId } from '@shared/contracts/pdf'
import { printTemplateIdSchema } from '@shared/contracts/pdf'
import { resolvePrintFixture } from './fixtures'
import './print.css'
import { PRINT_TEMPLATE_REGISTRY } from './templates/registry'

async function waitForAssets(): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    // ignore
  }
  const images = Array.from(document.images)
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
    ),
  )
  // Allow layout/paint to settle before printToPDF captures.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

export function PrintJobPage() {
  const { template: templateParam } = useParams()
  const [search] = useSearchParams()
  const jobId = search.get('jobId') ?? ''
  const fixtureId = search.get('fixture') ?? ''
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accent, setAccent] = useState('#0284c7')
  const [fixtureReady, setFixtureReady] = useState(false)

  const parsed = printTemplateIdSchema.safeParse(templateParam)
  const template: PrintTemplateId | null = parsed.success ? parsed.data : null

  // Resolve fixtures synchronously so a reused `/print/:template` route never paints
  // the previous job's payload with the new template (e.g. invoice → receipt).
  const fixture = fixtureId ? resolvePrintFixture(fixtureId) : null
  const fixtureError = fixtureId
    ? !fixture
      ? `Unknown print fixture: ${fixtureId}`
      : template && fixture.template !== template
        ? `Fixture ${fixtureId} is for ${fixture.template}, not ${template}`
        : null
    : null
  const activePayload = fixture && !fixtureError ? fixture.payload : payload
  const activeAccent = fixture?.payload.business
    ? String((fixture.payload.business as { accentColour?: string }).accentColour || accent)
    : accent

  useEffect(() => {
    let cancelled = false
    setPayload(null)
    setFixtureReady(false)
    setError(null)
    document.documentElement.dataset.printReady = '0'
    async function run() {
      if (fixtureId) return
      if (!jobId || !template) {
        setError('Missing print job')
        return
      }
      try {
        const job = await api.print.getJob(jobId)
        if (cancelled) return
        setAccent(job.accentColour || '#0284c7')
        setPayload(job.payload as Record<string, unknown>)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load print job')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [jobId, template, fixtureId])

  useEffect(() => {
    if (!activePayload) return
    if (fixtureError) return
    let cancelled = false
    async function ready() {
      await waitForAssets()
      if (cancelled) return
      if (fixtureId) {
        setFixtureReady(true)
        document.documentElement.dataset.printReady = '1'
        return
      }
      if (!jobId) return
      try {
        await api.print.documentReady(jobId)
      } catch {
        // Main may have timed out; nothing else to do.
      }
    }
    void ready()
    return () => {
      cancelled = true
    }
  }, [activePayload, jobId, fixtureId, fixtureError])

  if (fixtureError || error) {
    return <div className="p-8 text-red-600">{fixtureError || error}</div>
  }
  if (!template || !activePayload) {
    return <div className="p-8 text-slate-500">Preparing document…</div>
  }

  const render = PRINT_TEMPLATE_REGISTRY[template]
  return (
    <div
      key={`${template}-${fixtureId || jobId}`}
      data-print-ready={fixtureReady ? '1' : undefined}
      style={{ ['--print-accent' as string]: activeAccent }}
    >
      {render(activePayload)}
    </div>
  )
}
