import { Check, Clock, Navigation, Route as RouteIcon, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RouteMap } from '../../components/RouteMap'
import { Badge, Button, Callout, Card, cn, EmptyState, StatusBadge } from '../../components/ui'
import { fmtMin, fmtWindow } from '../../domain/time'
import { isDone } from '../../lib/select'
import { useDriverRoute } from './common'

export function RouteView() {
  const { trip, vehicle, stops, nextIdx, done } = useDriverRoute()
  if (!trip) return <EmptyState icon={<RouteIcon className="size-5" />} title="No route assigned yet" />
  const next = nextIdx >= 0 ? stops[nextIdx] : undefined
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold">
          {done} / {stops.length} <span className="text-lg font-semibold text-muted">complete</span>
        </h1>
        <span className="id text-muted">{trip.id}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / Math.max(1, stops.length)) * 100}%` }} />
      </div>

      {trip.status === 'PAUSED' && (
        <Callout tone="critical" title="Route paused" className="mt-4">
          A vehicle issue was reported. Wait for the dispatcher’s recovery plan.
        </Callout>
      )}

      {next && trip.status !== 'PAUSED' && (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-line bg-brand-soft px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-ink">Next stop</div>
          <div className="p-5">
            <div className="id text-3xl">{next.outlet.id}</div>
            <div className="text-muted">{next.outlet.name}</div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted">ETA</div>
                <div className="font-display text-2xl font-semibold tabular-nums">{fmtMin(next.plan.start)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Window</div>
                <div className="font-display text-lg font-semibold tabular-nums">{fmtWindow(next.outlet.window)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Service</div>
                <div className="font-display text-lg font-semibold">{next.plan.service} min</div>
              </div>
            </div>
            {next.plan.late && (
              <Callout tone="warning" icon={<TriangleAlert className="size-5" />} title="Delivery window will be missed" className="mt-4">
                Continue only if the outlet agrees to receive the delivery.
              </Callout>
            )}
            {next.outlet.mall && (
              <Callout tone="info" icon={<Clock className="size-5" />} title={`Mall access window ${fmtWindow(next.outlet.window)}`} className="mt-4">
                Security only admits deliveries inside this window.
              </Callout>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.outlet.name + ' Sri Lanka')}`} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="xl" block icon={<Navigation className="size-5" />}>
                  Navigate
                </Button>
              </a>
              <Link to={`/driver/stop/${next.order.id}`}>
                <Button size="xl" block>
                  {next.order.status === 'ARRIVED' ? 'Deliver' : 'Open stop'}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <ol className="divide-y divide-line">
          {stops.map((s, i) => {
            const d = isDone(s.order)
            const cur = i === nextIdx
            return (
              <li key={s.order.id}>
                <Link to={`/driver/stop/${s.order.id}`} className={cn('flex items-center gap-4 px-5 py-4', cur && 'bg-surface-2')}>
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold', d ? 'border-success bg-success text-white' : cur ? 'border-info text-info' : 'border-line-strong text-muted')}>
                    {d ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="id">{s.outlet.id}</span>
                    <span className="block truncate text-xs text-muted">{s.outlet.name}</span>
                  </span>
                  {d ? <StatusBadge s={s.order.status} /> : <span className="text-sm tabular-nums text-muted">{fmtMin(s.plan.start)}</span>}
                  {s.order.delivery?.offline && !d && <Badge>Saved</Badge>}
                </Link>
              </li>
            )
          })}
        </ol>
      </Card>

      <RouteMap
        className="mt-4 aspect-[4/3]"
        routes={[
          {
            id: trip.id,
            depot: vehicle.depot,
            stops: stops.map((s, i) => ({ outlet: s.outlet, state: isDone(s.order) ? (s.order.status === 'FAILED' ? 'problem' : 'done') : i === nextIdx ? 'current' : 'todo' })),
            vehicle: trip.status === 'IN_PROGRESS' && nextIdx >= 0 ? { label: vehicle.id, at: nextIdx } : undefined,
          },
        ]}
      />
    </div>
  )
}
