import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import type { PrintTemplateId } from '@shared/contracts/pdf'
import { printTemplateIdSchema } from '@shared/contracts/pdf'
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
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accent, setAccent] = useState('#0284c7')

  const parsed = printTemplateIdSchema.safeParse(templateParam)
  const template: PrintTemplateId | null = parsed.success ? parsed.data : null

  useEffect(() => {
    let cancelled = false
    async function run() {
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
  }, [jobId, template])

  useEffect(() => {
    if (!payload || !jobId) return
    let cancelled = false
    async function ready() {
      await waitForAssets()
      if (cancelled) return
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
  }, [payload, jobId])

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>
  }
  if (!template || !payload) {
    return <div className="p-8 text-slate-500">Preparing document…</div>
  }

  const render = PRINT_TEMPLATE_REGISTRY[template]
  return <div style={{ ['--print-accent' as string]: accent }}>{render(payload)}</div>
}
