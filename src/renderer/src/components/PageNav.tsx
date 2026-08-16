import { Link, useLocation, useNavigate } from 'react-router-dom'
import { popNavHistory, previousNavPath } from '@renderer/lib/nav-history'
import { crumbsForPath, parentPath } from '@renderer/lib/route-crumbs'
import { cn } from '@renderer/lib/utils'

export function PageNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const here = `${location.pathname}${location.search}`
  const crumbs = crumbsForPath(location.pathname)
  const parent = parentPath(location.pathname)
  const prev = previousNavPath()
  const canBack = Boolean((prev && prev !== here) || parent)

  if (!canBack && crumbs.length <= 1) return null

  function goBack() {
    const target = popNavHistory()
    if (target && target !== here) {
      navigate(target)
      return
    }
    if (parent) navigate(parent)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
      {canBack ? (
        <button
          type="button"
          onClick={goBack}
          className="rounded-md border bg-white px-2 py-1 text-slate-700 hover:bg-sky-50 hover:text-sky-900"
        >
          ← Back
        </button>
      ) : null}
      {crumbs.length > 1 ? (
        <nav
          className="flex flex-wrap items-center gap-1 text-muted-foreground"
          aria-label="Breadcrumb"
        >
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden="true">›</span> : null}
                {crumb.to && !last ? (
                  <Link className="hover:text-sky-800" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(last && 'font-medium text-slate-800')}>{crumb.label}</span>
                )}
              </span>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
