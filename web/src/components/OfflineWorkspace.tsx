import { CloudOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSession, useView } from '../store'
import { Badge, Button, Callout, Card, PageHeader } from './ui'

/** Office/store mutations need a connection; only field events have offline replay. */
export function OfflineWorkspace() {
  const d = useView()
  const user = useSession((s) => s.user)!
  const simulated = useSession((s) => s.simulateOffline)
  const reconnect = useSession((s) => s.setSimulateOffline)
  const orders = d.orders.filter((o) => user.role !== 'STORE_MANAGER' || o.outletId === user.assignedOutlet)
  return <>
    <PageHeader eyebrow="Saved information" title="Connection needed to make changes" subtitle="Your last saved orders are available below. Reconnect before changing the plan or confirming a receipt." />
    <Callout title="Offline workspace" tone="warning" icon={<CloudOff className="size-5" />} className="mb-5">Only driver and loader field actions support offline replay. Office and store actions are paused so they cannot appear confirmed before reaching the shared operation.</Callout>
    <div className="mb-5 flex flex-wrap gap-3">{simulated && <Button onClick={() => reconnect(false)}>Reconnect demo device</Button>}<Link to="/resilience"><Button variant="secondary">Service & recovery</Button></Link><Link to="/workflow"><Button variant="secondary">View workflow</Button></Link></div>
    <Card><ul className="divide-y divide-line">{orders.slice(0, 20).map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>{o.id} · {o.outletId}</span><Badge>{o.status.replaceAll('_', ' ')}</Badge></li>)}</ul><p className="p-4 text-xs text-muted">Showing up to 20 locally saved orders. This is not a live status update.</p></Card>
  </>
}
