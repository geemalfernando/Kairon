import { Radar } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RouteMap } from '../../components/RouteMap'
import { Badge, Button, Card, CardHeader, cn, EmptyState, PageHeader, toast } from '../../components/ui'
import { fmtMin } from '../../domain/time'
import { isDone, orderOf, outletOf, scheduleOf, vehicleOf } from '../../lib/select'
import { ops, useOps } from '../../store'

export function Live() {
  const d = useOps((s) => s.data)
  const [focus, setFocus] = useState<string | null>(null)
  const active = useMemo(() => d.trips.filter((t) => ['IN_PROGRESS', 'PAUSED'].includes(t.status)), [d])
  const dayTrips = d.trips.filter((t) => t.status !== 'DRAFT' && t.status !== 'ABORTED')
  const completed = d.orders.filter((o) => isDone(o)).length
  const remaining = dayTrips.flatMap((t) => t.stops).filter((id) => !isDone(orderOf(d, id))).length
  const issues = d.issues.filter((i) => !i.resolved).length

  const rows = active.map((t) => {
    const s = scheduleOf(d, t)
    const nextIdx = t.stops.findIndex((id) => !isDone(orderOf(d, id)))
    const next = s.stops[nextIdx]
    return { t, s, nextIdx, next, v: vehicleOf(d, t.vehicleId)! }
  })

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Live operations"
        actions={
          d.plan === 'PUBLISHED' &&
          active.length < 2 && (
            <Button variant="secondary" onClick={() => (ops('simulateFleet', 'VEH014'), toast('Fleet dispatched', { body: 'Demo: other vehicles are now on the road' }))}>
              Simulate fleet departure
            </Button>
          )
        }
      />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {[
          [active.length, 'vehicles active', 'bg-info'],
          [completed, 'deliveries completed', 'bg-success'],
          [remaining, 'remaining', 'bg-steel'],
          [issues, 'issues', issues ? 'bg-critical' : 'bg-steel'],
        ].map(([n, l, c]) => (
          <span key={l as string} className="inline-flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', c as string)} />
            <b className="font-display text-lg">{n}</b> <span className="text-muted">{l}</span>
          </span>
        ))}
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState icon={<Radar className="size-5" />} title="No vehicles on the road yet" body="Vehicles appear here as soon as drivers start their routes. Publish the plan, load VEH014 as the loader, and start the route as the driver." />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <RouteMap
            className="aspect-[4/3] xl:sticky xl:top-24"
            outlets={d.outlets}
            routes={rows.map(({ t, v, nextIdx }) => ({
              id: t.id,
              depot: v.depot,
              highlight: focus ? focus === t.id : undefined,
              color: t.status === 'PAUSED' ? 'var(--critical)' : t.vehicleId === 'VEH014' ? 'var(--attention)' : 'var(--brand)',
              stops: t.stops.map((id, i) => {
                const o = orderOf(d, id)!
                return { outlet: outletOf(d, o.outletId)!, state: isDone(o) ? (o.status === 'FAILED' ? 'problem' : 'done') : i === nextIdx ? 'current' : 'todo' }
              }),
              vehicle: t.status === 'IN_PROGRESS' && nextIdx >= 0 ? { label: t.vehicleId, at: nextIdx } : undefined,
            }))}
          />
          <Card>
            <CardHeader title="Vehicles" eyebrow={`${rows.length} on the road`} />
            <ul className="divide-y divide-line">
              {rows.map(({ t, next, s }) => {
                const done = t.stops.filter((id) => isDone(orderOf(d, id))).length
                return (
                  <li key={t.id} onMouseEnter={() => setFocus(t.id)} onMouseLeave={() => setFocus(null)}>
                    <Link to={`/dispatcher/routes/${t.id}`} className="block px-5 py-4 hover:bg-surface-2">
                      <div className="flex items-center justify-between">
                        <span className="id">{t.vehicleId}</span>
                        {t.status === 'PAUSED' ? (
                          <Badge tone="critical" dot>
                            Stopped
                          </Badge>
                        ) : (
                          <Badge tone="info" dot>
                            In transit
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-muted">Next</div>
                          <div className="id">{next ? next.outletId : '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted">ETA</div>
                          <div className="font-semibold tabular-nums">{next ? fmtMin(next.start) : '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted">Late risk</div>
                          <div className={cn('font-semibold', next && next.lateRisk >= 45 && 'text-attention-ink')}>{next ? `${next.lateRisk}%` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted">Progress</div>
                          <div className="font-semibold">
                            {done}/{s.stops.length}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  )
}
