import { BrainCircuit, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Stat, Textarea, toast } from '../../components/ui'
import { MODE_LABELS, predictStops } from '../../domain/intelligence'
import { fmtMin } from '../../domain/time'
import { ops, useNetwork, useOps } from '../../store'

export function Predictions() {
  const d = useOps((s) => s.data)
  const net = useNetwork()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('order') ?? '')
  const [filter, setFilter] = useState('ALL')
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const mode = d.intelligence?.mode ?? 'READY'
  const predictions = predictStops(d, mode, net.online).filter((p) => {
    const order = d.orders.find((o) => o.id === p.orderId)!
    return !['RECEIVED', 'DELIVERED', 'FAILED', 'PARTIAL'].includes(order.status) && order.deliveryDate === d.deliveryDate
  })
  const rows = predictions.filter((p) => {
    const order = d.orders.find((o) => o.id === p.orderId)!
    return `${order.id} ${order.outletId} ${order.brand}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'ALL' || filter === 'REVIEW' && p.needsReview || filter === 'UNASSIGNED' && !p.tripId)
  }).sort((a, b) => (b.lateProbability ?? -1) - (a.lateProbability ?? -1))
  const active = predictions.find((p) => p.orderId === selected)
  const order = d.orders.find((o) => o.id === selected)
  return <>
    <PageHeader eyebrow="Decision support" title="AI prediction review" subtitle="Review service time and arrival-after-window risk before releasing a route." actions={<Link to="/resilience"><Button variant="secondary">Service status</Button></Link>} />
    <Callout title="Demo estimates · human decisions" icon={<BrainCircuit className="size-5" />} className="mb-5">These transparent rules demonstrate the prediction experience. No trained model, live traffic feed, calibrated probabilities, or measured accuracy is connected. Reviewing a prediction does not override vehicle or delivery constraints.</Callout>
    {(mode !== 'READY' || !net.online) && <Callout tone="warning" title={!net.online ? 'Offline: saved planning allowances' : MODE_LABELS[mode]} className="mb-5">{mode === 'LOW_CONFIDENCE' && net.online ? 'Ranges are wider. Review the underlying stop before deciding.' : 'Risk probabilities are hidden. Existing routes and operating constraints remain available.'} <Link className="underline" to="/resilience">Recovery options</Link></Callout>}
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Orders in this run" value={predictions.length} />
      <Stat label="Need review" value={predictions.filter((p) => p.needsReview).length} tone="attention" icon={<TriangleAlert className="size-4" />} />
      <Stat label="Route assigned" value={predictions.filter((p) => p.tripId).length} />
      <Stat label="Reviewed" value={predictions.filter((p) => d.intelligence?.reviews.some((r) => r.orderId === p.orderId)).length} tone="success" icon={<ShieldCheck className="size-4" />} />
    </div>
    <Card>
      <CardHeader title="Stop-level estimates" eyebrow="Arrival risk is separate from unloading duration" />
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
        <Field label="Find an order or outlet">{(id) => <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ORD…, OUT…, Fresh…" />}</Field>
        <Field label="Show">{(id) => <Select id={id} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">All open orders</option><option value="REVIEW">Needs review</option><option value="UNASSIGNED">Awaiting allocation</option></Select>}</Field>
      </div>
      {rows.length === 0 ? <EmptyState icon={<Search className="size-5" />} title="No orders match" body="Clear the filter or create orders for this run." /> : <div className="divide-y divide-line">{rows.map((p) => {
        const o = d.orders.find((x) => x.id === p.orderId)!
        const reviewed = d.intelligence?.reviews.find((r) => r.orderId === o.id)
        return <div key={p.orderId} className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <div><p className="id font-semibold">{o.id} · {o.outletId}</p><p className="mt-1 text-xs text-muted">{o.brand} · {p.tripId ?? 'Not allocated'} · {p.confidence} confidence</p>{reviewed && <Badge tone="success">Reviewed</Badge>}</div>
          <div className="text-sm"><p>{p.serviceRange[0]}–{p.serviceRange[1]} min handling</p><p className="mt-1 text-muted">{p.arrival !== null ? `Planned arrival ${fmtMin(p.arrival)}` : 'Arrival not estimated'}</p><p className={p.needsReview ? 'text-attention-ink' : 'text-muted'}>{p.lateProbability === null ? 'Late likelihood unavailable' : `${Math.round(p.lateProbability * 100)}% illustrative late likelihood`}</p></div>
          <Button variant="secondary" onClick={() => { setSelected(o.id); setNote(reviewed?.note ?? '') }}>Review estimate</Button>
        </div>
      })}</div>}
    </Card>
    <Modal open={!!active} onClose={() => setSelected(null)} title={`Review ${selected ?? ''}`} eyebrow={order ? `${order.outletId} · ${order.brand}` : undefined} footer={<Button disabled={!net.online || !note.trim()} onClick={() => {
      if (!selected || !net.online) return
      ops('reviewPrediction', selected, note)
      toast('Review saved to audit history')
      setSelected(null)
    }}>Save review</Button>}>
      {active && <div className="space-y-4">
        <Callout title={`${active.serviceRange[0]}–${active.serviceRange[1]} minutes at outlet`} tone={active.needsReview ? 'warning' : 'info'}>Arrival after the receiving window is the lateness target. Early arrival waits until opening; that wait is not unloading time. Ranges are scenario bounds, not statistical confidence intervals.</Callout>
        <ul className="list-disc space-y-2 pl-5 text-sm">{active.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="flex flex-wrap gap-2"><Link to="/dispatcher/planning"><Button variant="secondary">Adjust allocation</Button></Link>{active.tripId && <Link to={`/dispatcher/routes/${active.tripId}`}><Button variant="secondary">Inspect route</Button></Link>}<Link to="/dispatcher/deferred"><Button variant="secondary">Review deferrals</Button></Link></div>
        <Field label="Decision and rationale" hint="For example: keep this stop, or review an earlier departure in Planning. Saving here records your review only.">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {!net.online && <p className="text-sm text-attention-ink">Reconnect before saving dispatcher decisions.</p>}
      </div>}
    </Modal>
  </>
}
