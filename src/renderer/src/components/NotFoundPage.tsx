import { Link } from 'react-router-dom'
import { PageHeader } from './PageHeader'
import { Button } from './ui/button'

export function NotFoundPage() {
  return (
    <div className="p-8">
      <PageHeader
        title="Page not found"
        subtitle="That screen is not in Aqua Nuqi. Use the menu on the left, or go back to the dashboard."
      />
      <Button asChild>
        <Link to="/">Back to Dashboard</Link>
      </Button>
    </div>
  )
}
