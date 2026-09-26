import { ArrowRight, CheckCircle2, Circle, Route } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HOME, ROLE_LABEL } from '../../components/shell/nav'
import { Badge, Button, Callout, Card, PageHeader, Stat } from '../../components/ui'
import type { Role } from '../../domain/types'
import { useSession, useView } from '../../store'

export function Workflow() {
  const d = useView()
  const user = useSession((s) => s.user)!
  const role = user.role
  const fieldTrips = d.trips.filter((t) => role === 'DRIVER' ? t.vehicleId === user.assignedVehicle : role === 'LOADER' ? d.vehicles.find((v) => v.id === t.vehicleId)?.depot === user.depot : true)
  const orders = d.orders.filter((o) => role === 'STORE_MANAGER' ? o.outletId === user.assignedOutlet : role === 'DRIVER' ? fieldTrips.some((t) => t.stops.includes(o.id)) : role === 'LOADER' ? d.outlets.find((x) => x.id === o.outletId)?.depot === user.depot : true).filter((o) => o.deliveryDate === d.deliveryDate)
  const trips = fieldTrips.filter((t) => t.stops.some((id) => orders.some((o) => o.id === id)) && t.status !== 'ABORTED')
  const delivered = orders.filter((o) => ['DELIVERED', 'PARTIAL', 'RECEIVED'].includes(o.status)).length
  const received = orders.filter((o) => !!o.receipt).length
  const step = (title: string, owner: Role, to: string, done: boolean, detail: string, next: string) => ({ title, owner, to, done, detail, next })
  const steps = [
    step('Place and confirm orders', 'STORE_MANAGER', '/store/orders/new', orders.length > 0, `${orders.length} orders for this run. Fresh ambient and chilled goods are separate orders. Late orders move to the next operating run.`, 'Dispatcher receives confirmed demand.'),
    step('Close orders and allocate', 'DISPATCHER', '/dispatcher/planning', d.plan !== 'NONE', 'Close the queue, allocate vehicles, validate weight, volume, fuel, access and receiving windows. Review each proposed deferral.', 'Loader receives the published stop sequence.'),
    step('Review predictions and publish', 'DISPATCHER', '/dispatcher/predictions', d.plan === 'PUBLISHED', 'Inspect handling time and late-arrival estimates. Apply changes in Planning, then publish a valid plan.', 'Published routes appear on the dock tablet.'),
    step('Load in reverse stop order', 'LOADER', '/loader/trips', trips.length > 0 && trips.every((t) => ['LOADED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(t.status)), 'Count each item, flag missing or damaged stock, and confirm loading. Unresolved shortfalls need a dispatcher decision.', 'Driver can start after loading is confirmed.'),
    step('Deliver and capture proof', 'DRIVER', '/driver/route', orders.length > 0 && orders.every((o) => ['DELIVERED', 'PARTIAL', 'FAILED', 'RECEIVED', 'DEFERRED'].includes(o.status)), `${delivered} deliveries recorded. Follow stops, record arrival, outcome and proof. Offline work stays on this device until sync.`, 'Store receives delivery details and proof.'),
    step('Confirm receipt and exceptions', 'STORE_MANAGER', '/store/deliveries', delivered > 0 && received === delivered, `${received} receipts confirmed. Check received quantities and condition; discrepancies reach the dispatcher.`, 'Dispatcher can close issues using the shared audit record.'),
    step('Review service and plan capacity', 'DISPATCHER', '/dispatcher/capacity', !!d.intelligence?.capacityPlans.length, 'Review repeated deferrals and issues, compare ten-week demand with fleet capacity, and record a vehicle/driver proposal.', 'The next planning cycle uses the operational feedback.'),
  ]
  return <>
    <PageHeader eyebrow={`${ROLE_LABEL[role]} workspace`} title="Order to receipt" subtitle={`Follow the handoffs for ${d.deliveryDate}. Progress reflects the orders visible to your role.`} actions={<Link to={HOME[role]}><Button variant="secondary">My dashboard</Button></Link>} />
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Orders" value={orders.length} /><Stat label="Active trips" value={trips.length} /><Stat label="Delivered" value={delivered} tone="brand" /><Stat label="Receipts confirmed" value={received} tone="success" /></div>
    <Callout title="One operation, four handoffs" className="mb-5">Complete the actions assigned to your role. Other roles continue from their own workspace. For the demo, use separate browser tabs with each seeded account; updates are shared within this browser. <Link to="/resilience" className="font-semibold underline">Something went wrong?</Link></Callout>
    <div className="space-y-3">{steps.map((s, i) => <Card key={s.title} className="flex gap-4 p-5">
      <div className={`grid size-10 shrink-0 place-items-center rounded-full ${s.done ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand-ink'}`}>{s.done ? <CheckCircle2 className="size-5" /> : i + 1}</div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{s.title}</h2><Badge tone={s.owner === role ? 'brand' : 'neutral'}>{ROLE_LABEL[s.owner]}</Badge>{s.done && <Badge tone="success">Complete</Badge>}</div><p className="mt-2 text-sm text-muted">{s.detail}</p><p className="mt-2 text-xs text-muted">Handoff: {s.next}</p>{s.owner === role ? <Link to={s.to} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">{s.done ? 'Review' : 'Open step'} <ArrowRight className="size-4" /></Link> : <p className="mt-3 flex items-center gap-1 text-xs text-muted"><Circle className="size-3" /> Handled in the {ROLE_LABEL[s.owner].toLowerCase()} workspace</p>}</div>
    </Card>)}</div>
  </>
}

export function WorkflowEntry() {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm"><span className="flex items-center gap-2 font-medium text-brand-ink"><Route className="size-4" /> Your next step, connected to every role</span><Link to="/workflow" className="font-semibold text-brand-ink">Open full workflow →</Link></div>
}
