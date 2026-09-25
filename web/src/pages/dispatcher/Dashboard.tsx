import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, Columns3, Radar, Snowflake, Truck } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RouteMap } from '../../components/RouteMap'
import { Badge, Button, Card, CardHeader, cn, EmptyState, Meter, PageHeader, severityTone, Stat, toneBorder } from '../../components/ui'
import { isReefer } from '../../domain/seed'
import { fmtDate, fmtMin, greeting, hm, timeAgo } from '../../domain/time'
import type { Brand } from '../../domain/types'
import { isDone, outletOf, scheduleOf } from '../../lib/select'
import { useOps, useSession } from '../../store'
import { severityRank } from '../../store/events'

export function useDispatchMetrics() {
  const d = useOps((s) => s.data)
  return useMemo(() => {
    const active = d.trips.filter((t) => t.status !== 'ABORTED')
    const scheds = active.map((t) => ({ t, s: scheduleOf(d, t) }))
    const atRisk = scheds.flatMap(({ s }) => s.stops.filter((x) => x.lateRisk >= 45 && !isDone(d.orders.find((o) => o.id === x.orderId)))).length
    const reefers = d.vehicles.filter((v) => isReefer(v.type) && v.status === 'AVAILABLE')
    const reeferUsed = reefers.filter((v) => active.some((t) => t.vehicleId === v.id && t.number === 1)).length
    const used = new Set(active.map((t) => t.vehicleId))
    const bySession = (brand: Brand) => {
      const ts = active.filter((t) => t.brand === brand)
      return {
        vehicles: new Set(ts.map((t) => t.vehicleId)).size,
        orders: d.orders.filter((o) => o.brand === brand && o.status !== 'DEFERRED').length,
        risks: scheds.filter(({ t }) => t.brand === brand).flatMap(({ s }) => s.stops.filter((x) => x.lateRisk >= 45)).length,
      }
    }
    return {
      orders: d.orders.length,
      available: d.vehicles.filter((v) => v.status === 'AVAILABLE').length,
      planned: d.orders.filter((o) => o.tripId).length,
      deferred: d.orders.filter((o) => o.status === 'DEFERRED').length,
      atRisk,
      reeferUsed,
      reeferTotal: reefers.length,
      vehiclesUsed: used.size,
      sessions: { Fresh: bySession('Fresh'), Style: bySession('Style'), Tech: bySession('Tech') },
      delivered: d.orders.filter((o) => isDone(o)).length,
    }
  }, [d])
}

const STAGES = ['Orders open', 'Orders closed', 'Plan drafted', 'Plan published', 'Delivering'] as const

export function Dashboard() {
  const d = useOps((s) => s.data)
  const user = useSession((s) => s.user)!
  const m = useDispatchMetrics()
  const navigate = useNavigate()
  const delivering = d.trips.some((t) => ['IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(t.status))
  const stage = delivering ? 4 : d.plan === 'PUBLISHED' ? 3 : d.plan === 'DRAFT' ? 2 : d.ordersClosed ? 1 : 0
  const alerts = d.issues.filter((i) => !i.resolved).sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.createdAt - a.createdAt)
  const liveRoutes = d.trips.filter((t) => t.number === 1 && t.status !== 'ABORTED' && t.status !== 'DRAFT').slice(0, 14)

  const next = [
    { label: 'Close orders & begin planning', to: '/dispatcher/orders?close=1', icon: ClipboardList },
    { label: 'Generate recommended plan', to: '/dispatcher/planning', icon: Columns3 },
    { label: 'Review & publish plan', to: '/dispatcher/planning', icon: Columns3 },
    { label: 'Watch live operations', to: '/dispatcher/live', icon: Radar },
    { label: 'Watch live operations', to: '/dispatcher/live', icon: Radar },
  ][stage]

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${user.name}`}
        title={`${user.depot} Operations`}
        subtitle={`${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} · planning deliveries for ${fmtDate(d.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <Button icon={<next.icon className="size-4" />} onClick={() => navigate(next.to)}>
            {next.label}
          </Button>
        }
      />

      <Card className="mb-6 p-4">
        <ol className="grid grid-cols-5 gap-2">
          {STAGES.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cn('h-1.5 rounded-full', i < stage ? 'bg-brand' : i === stage ? 'bg-attention' : 'bg-surface-3')} />
              <div className={cn('mt-2 hidden truncate text-xs font-semibold uppercase tracking-wide sm:block', i === stage ? 'text-ink' : 'text-muted')}>{s}</div>
            </li>
          ))}
        </ol>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide sm:hidden">
          Step {stage + 1} of {STAGES.length} · {STAGES[stage]}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Orders" value={m.orders} sub={`${m.delivered} delivered`} icon={<ClipboardList className="size-4" />} tone="brand" />
        <Stat label="Vehicles available" value={`${m.available}/${d.vehicles.length}`} sub={`${m.vehiclesUsed} allocated`} icon={<Truck className="size-4" />} />
        <Stat label="Planned" value={m.planned} sub={d.plan === 'NONE' ? 'No plan yet' : d.plan === 'DRAFT' ? 'Draft' : 'Published'} tone="brand" />
        <Stat label="Deferred" value={m.deferred} sub="with reasons" tone={m.deferred ? 'attention' : 'neutral'} icon={<CalendarClock className="size-4" />} />
        <Stat label="At risk" value={m.atRisk} sub="late-window risk" tone={m.atRisk ? 'attention' : 'neutral'} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Reefer capacity" value={`${m.reeferUsed}/${m.reeferTotal}`} sub="refrigerated vehicles used" tone="info" icon={<Snowflake className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader eyebrow="Today's operation" title="Delivery sessions" action={<span className="text-xs text-muted">03:30 → 17:00</span>} />
            <div className="space-y-4 p-5">
              {(
                [
                  ['Fresh', hm(3, 45), hm(8), 'bg-brand'],
                  ['Style', hm(8, 30), hm(12, 30), 'bg-info'],
                  ['Tech', hm(12, 15), hm(17), 'bg-steel'],
                ] as const
              ).map(([brand, a, b, c]) => {
                const s = m.sessions[brand]
                const left = ((a - hm(3, 30)) / (hm(17) - hm(3, 30))) * 100
                const width = ((b - a) / (hm(17) - hm(3, 30))) * 100
                return (
                  <div key={brand}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">{brand} operations</span>
                      <span className="text-xs text-muted">
                        {s.vehicles} vehicles · {s.orders} orders · <span className={s.risks ? 'font-semibold text-attention-ink' : ''}>{s.risks} late risks</span>
                      </span>
                    </div>
                    <div className="relative h-7 rounded-md bg-surface-2">
                      <div className={cn('absolute inset-y-0 flex items-center rounded-md px-2 text-[11px] font-semibold text-white', c)} style={{ left: `${left}%`, width: `${width}%` }}>
                        {fmtMin(a)}–{fmtMin(b)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Network" title={liveRoutes.length ? `${liveRoutes.length} early routes` : 'Outlet network'} action={<Link to="/dispatcher/routes" className="text-sm font-medium text-brand-ink">All routes</Link>} />
            <div className="p-4">
              <RouteMap
                className="aspect-[16/10]"
                outlets={d.outlets}
                focus="network"
                routes={liveRoutes.map((t, i) => ({
                  id: t.id,
                  depot: d.vehicles.find((v) => v.id === t.vehicleId)!.depot,
                  color: t.vehicleId === 'VEH014' ? 'var(--attention)' : i % 2 ? 'var(--brand)' : 'var(--info)',
                  stops: t.stops.map((id) => {
                    const o = d.orders.find((x) => x.id === id)!
                    return { outlet: outletOf(d, o.outletId)!, state: isDone(o) ? 'done' : 'todo' }
                  }),
                }))}
              />
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader eyebrow="Alerts" title={`${alerts.length} need attention`} action={<Link to="/dispatcher/issues" className="text-sm font-medium text-brand-ink">Issue center</Link>} />
          {alerts.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="size-5" />} title="No active alerts" body="Breakdowns, shortfalls and late risks will appear here the moment they’re reported." />
          ) : (
            <ul className="divide-y divide-line">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id} className={cn('border-l-4 px-5 py-4', toneBorder[severityTone[a.severity]])}>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={severityTone[a.severity]} dot>
                      {a.severity}
                    </Badge>
                    <span className="text-[11px] text-faint">{timeAgo(a.createdAt)}</span>
                  </div>
                  <div className="mt-2 font-semibold">{a.title}</div>
                  <div className="text-sm text-muted">{a.detail}</div>
                  <Link to={`/dispatcher/issues/${a.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
                    {a.severity === 'CRITICAL' ? 'Review' : a.kind === 'FUEL' ? 'View' : 'Resolve'} <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {m.deferred > 0 && (
            <div className="border-t border-line p-5">
              <Meter label="Deferred orders" value={m.deferred} max={m.orders} warnAt={0} detail={`${m.deferred} of ${m.orders}`} />
              <Link to="/dispatcher/deferred" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
                Review deferrals <ArrowRight className="size-3.5" />
              </Link>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
