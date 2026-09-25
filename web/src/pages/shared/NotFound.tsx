import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HOME } from '../../components/shell/nav'
import { Button, EmptyState } from '../../components/ui'
import { useSession } from '../../store'

export function NotFound() {
  const user = useSession((s) => s.user)
  return (
    <EmptyState
      icon={<Compass className="size-5" />}
      title="This page doesn’t exist"
      body="The link may be out of date."
      action={
        <Link to={user ? HOME[user.role] : '/'}>
          <Button>Back to workspace</Button>
        </Link>
      }
    />
  )
}
