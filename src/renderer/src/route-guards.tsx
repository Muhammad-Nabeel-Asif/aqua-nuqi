import { Navigate } from 'react-router-dom'
import { useSessionStore } from './stores/session'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useSessionStore((s) => s.user)
  const setupRequired = useSessionStore((s) => s.setupRequired)
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireSetup({ children }: { children: React.ReactNode }) {
  const setupRequired = useSessionStore((s) => s.setupRequired)
  if (!setupRequired) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireOwner({ children }: { children: React.ReactNode }) {
  const user = useSessionStore((s) => s.user)
  if (user?.role !== 'owner') {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Owner only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen is only for the owner account. Ask the owner if you need something changed
          here.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
