import { ArrowLeft, Route as RouteIcon, Snowflake } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuditTimeline } from '../../components/AuditTimeline'
import { RouteMap } from '../../components/RouteMap'
import { Badge, Card, CardHeader, cn, EmptyState, Meter, PageHeader, Segmented, StatusBadge, type Tone } from '../../components/ui'
import { TRIP_LIMIT_MIN } from '../../domain/rules'
import { isReefer, vehicleLabel } from '../../domain/seed'
import { fmtMin, fmtWindow } from '../../domain/time'
import type { Trip } from '../../domain/types'
import { auditFor, isDone, orderOf, outletOf, scheduleOf, tripProgress, vehicleOf } from '../../lib/select'
import { useOps } from '../../store'

export const tripTone: Record<Trip['status'], Tone> = {
  DRAFT: 'neutral',
  PLANNED: 'brand',
  LOADING: 'warning',
  LOADED: 'info',
  IN_PROGRESS: 'info',
  PAUSED: 'critical',
  COMPLETED: 'success',
  ABORTED: 'neutral',
}
export const tripLabel = (s: Trip['status']) => s.replace('_', ' ').toLowerCase()

export function RoutesPage() {
  const d = useOps((s) => s.data)
  const [brand, setBrand] = useState<'all' | 'Fresh' | 'Style' | 'Tech'>('all')
  const trips = useMemo(() => d.trips.filter((t) => t.stops.length && (brand === 'all' || t.brand === brand)).sort((a, b) => a.departure - b.departure || a.vehicleId.localeCompare(b.vehicleId)), [d, brand])
  return (
    <>
      <PageHeader eyebrow="Operations" title="Routes" subtitle={`${trips.length} trips${d.plan === 'DRAFT' ? ' · draft plan' : ''}`} actions={<Segmented value={brand} onChange={setBrand} options={['all', 'Fresh', 'Style', 'Tech'].map((b) => ({ value: b as typeof brand, label: b === 'all' ? 'All' : b }))} />} />
      {trips.length === 0 ? (
        <Card>
          <EmptyState icon={<RouteIcon className="size-5" />} title="No routes yet" body="Routes appear once orders are allocated in Planning." action={<Link to="/dispatcher/planning" className="text-sm font-semibold text-brand-ink">Open planning</Link>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((t) => {
            const s = scheduleOf(d, t)
            const v = vehicleOf(d, t.vehicleId)!
            const p = tripProgress(d, t)
            return (
              <Link key={t.id} to={`/dispatcher/routes/${t.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:border-brand">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="id text-lg">{t.vehicleId}</span>
                        {isReefer(v.type) && <Snowflake className="size-4 text-info" />}
                      </div>
                      <div className="text-sm text-muted">
                        Trip {t.number} · {t.brand} · {t.district}
                      </div>
                    </div>
                    <Badge tone={tripTone[t.status]} dot>
                      {tripLabel(t.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between text-sm">
                    <span>
                      <span className="font-display text-xl font-semibold">{fmtMin(t.departure)}</span> <span className="text-muted">departure</span>
                    </span>
                    <span className="text-muted">finish {fmtMin(s.finish)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.stops.map((id, i) => {
                      const o = orderOf(d, id)!
                      return (
                        <span key={id} className={cn('rounded-md border px-1.5 py-0.5 font-mono text-[11px]', isDone(o) ? 'border-success/40 bg-success-soft text-success-ink' : 'border-line')}>
                          {i + 1}·{o.outletId}
                        </span>
                      )
                    })}
                  </div>
                  <Meter className="mt-4" label={`${p.done}/${p.total} stops`} value={s.volumeM3} max={v.capacityM3} detail={`${s.volumeM3}/${v.capacityM3} m³`} />
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

export function RouteDetail() {
  const { tripId } = useParams()
  const d = useOps((s) => s.data)
  const t = d.trips.find((x) => x.id === tripId)
  if (!t) return <EmptyState icon={<RouteIcon className="size-5" />} title="Route not found" />
  const v = vehicleOf(d, t.vehicleId)!
  const s = scheduleOf(d, t)
  const firstOpen = t.stops.findIndex((id) => !isDone(orderOf(d, id)))
  return (
    <>
      <Link to="/dispatcher/routes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Routes
      </Link>
      <PageHeader
        eyebrow={`Trip ${t.number} · ${t.brand} · ${t.district}`}
        title={
          <span className="flex items-center gap-3">
            <span className="id">{t.vehicleId}</span>
            <Badge tone={tripTone[t.status]} dot>
              {tripLabel(t.status)}
            </Badge>
          </span>
        }
        subtitle={`${vehicleLabel(v.type)} · ${v.driver} · departs ${fmtMin(t.departure)} · expected finish ${fmtMin(s.finish)}`}
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <RouteMap
            className="aspect-[4/3]"
            routes={[
              {
                id: t.id,
                depot: v.depot,
                stops: t.stops.map((id, i) => {
                  const o = orderOf(d, id)!
                  return { outlet: outletOf(d, o.outletId)!, state: isDone(o) ? (o.status === 'FAILED' ? 'problem' : 'done') : i === firstOpen && t.status === 'IN_PROGRESS' ? 'current' : 'todo' }
                }),
                vehicle: t.status === 'IN_PROGRESS' ? { label: t.vehicleId, at: firstOpen } : undefined,
              },
            ]}
          />
          <Card className="grid gap-3 p-5 sm:grid-cols-3">
            <Meter label="Weight" value={s.weightKg} max={v.capacityKg} detail={`${s.weightKg} / ${v.capacityKg} kg`} />
            <Meter label="Volume" value={s.volumeM3} max={v.capacityM3} detail={`${s.volumeM3} / ${v.capacityM3} m³`} />
            <Meter label="Trip time" value={s.totalMin} max={TRIP_LIMIT_MIN} detail={`${Math.round(s.totalMin)} / ${TRIP_LIMIT_MIN} min`} />
          </Card>
        </div>
        <Card>
          <CardHeader title="Stop list" eyebrow={`${s.stops.length} stops`} />
          <ol className="divide-y divide-line">
            {s.stops.map((st, i) => {
              const o = orderOf(d, st.orderId)!
              const out = outletOf(d, st.outletId)!
              return (
                <li key={st.orderId} className="flex gap-4 px-5 py-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs font-semibold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="id">{out.id}</span>
                      <StatusBadge s={o.status} />
                    </div>
                    <div className="text-xs text-muted">{out.name}</div>
                    <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <dt className="text-muted">ETA</dt>
                        <dd className="font-semibold tabular-nums">{fmtMin(st.start)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Window</dt>
                        <dd className="font-semibold tabular-nums">{fmtWindow(st.window)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Service</dt>
                        <dd className="font-semibold">{st.service} min</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Late risk</dt>
                        <dd className={cn('font-semibold', st.lateRisk >= 45 ? 'text-attention-ink' : '')}>{st.lateRisk}%</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="border-t border-line p-5">
            <div className="eyebrow mb-3">Vehicle log</div>
            <AuditTimeline events={auditFor(d, t.vehicleId).slice(-8)} />
          </div>
        </Card>
      </div>
    </>
  )
}
