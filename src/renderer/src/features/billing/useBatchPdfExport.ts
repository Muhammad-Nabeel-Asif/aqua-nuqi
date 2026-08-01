import { useEffect, useRef, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { api } from '@renderer/lib/api'
import { newClientId } from '@renderer/lib/client-id'

export function useBatchPdfExport() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const jobIdRef = useRef<string | null>(null)

  useEffect(() => {
    return window.api.on('pdf:batchProgress', (payload) => {
      const ev = payload as {
        jobId: string
        current: number
        total: number
        status: string
        message?: string
        fileName?: string
      }
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      setCurrent(ev.current)
      setTotal(ev.total)
      setMessage(ev.fileName || ev.message || '')
      if (ev.status === 'done' || ev.status === 'cancelled') {
        setCancelling(false)
      }
    })
  }, [])

  async function run(input: {
    period?: string
    invoiceIds?: number[]
    filter?: {
      mode: 'all' | 'area' | 'route' | 'selected'
      areaId?: number
      routeId?: number
      customerIds?: number[]
    }
  }) {
    const jobId = newClientId()
    jobIdRef.current = jobId
    setOpen(true)
    setCurrent(0)
    setTotal(input.invoiceIds?.length ?? 0)
    setMessage('')
    setCancelling(false)
    try {
      const result = await api.pdf.batchGenerate({ ...input, jobId })
      setOpen(false)
      toast({
        title: result.cancelled
          ? `Cancelled — ${result.generated} PDFs saved`
          : `${result.generated} PDFs generated`,
        description:
          result.errors.length > 0
            ? `${result.errors.length} failed. Folder: ${result.folder}`
            : result.folder,
        variant: result.errors.length ? 'error' : 'success',
      })
      if (result.folder) {
        const open = window.confirm(
          `${result.generated} files in:\n${result.folder}\n\nOpen folder?`,
        )
        if (open) await api.shell.openPath(result.folder)
      }
      return result
    } catch (e) {
      setOpen(false)
      toast({
        title: 'Batch export failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'error',
      })
      return null
    } finally {
      jobIdRef.current = null
    }
  }

  function cancel() {
    if (!jobIdRef.current) return
    setCancelling(true)
    void api.pdf.cancelBatch(jobIdRef.current)
  }

  return {
    run,
    cancel,
    progress: { open, current, total, message, cancelling },
  }
}
