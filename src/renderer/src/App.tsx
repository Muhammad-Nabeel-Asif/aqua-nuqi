import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { BrandLockup } from './brand'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Skeleton } from './components/Skeleton'
import { ToastViewport } from './components/Toast'
import { api } from './lib/api'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import { useSessionStore } from './stores/session'

export function App() {
  const ready = useSessionStore((s) => s.ready)
  const setSession = useSessionStore((s) => s.setSession)
  const setReady = useSessionStore((s) => s.setReady)

  useEffect(() => {
    void api.auth
      .session()
      .then((session) => {
        setSession(session)
        setReady(true)
      })
      .catch(() => {
        setSession({ user: null, locked: false, setupRequired: true })
        setReady(true)
      })
  }, [setReady, setSession])

  // Branded splash: this is the first frame of every launch, and on a slow
  // laptop the session probe can take a moment.
  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8">
        <BrandLockup size="2xl" />
        <div className="w-64 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastViewport />
        <ConfirmDialogHost />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
