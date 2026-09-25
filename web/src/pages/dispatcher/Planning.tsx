import { CalendarClock, Check, GripVertical, Lock, Send, Snowflake, Sparkles, Truck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Callout, Card, CheckRow, cn, EmptyState, Meter, Modal, PageHeader, Segmented, toast } from '../../components/ui'
import { TRIP_LIMIT_MIN, validate, type Validation } from '../../domain/rules'
import { isReefer, isVan, vehicleLabel } from '../../domain/seed'
import { fmtMin } from '../../domain/time'
import type { Order, Trip, Vehicle } from '../../domain/types'
import { outletOf, scheduleOf } from '../../lib/select'
import { ops, useOps } from '../../store'
import { BlockedModal, DeferModal, OrderDrawer, tryAssign } from './shared'

type Filter = 'all' | 'used' | 'reefer' | 'truck' | 'van' | 'idle'

export function Planning() {
  const d = useOps((s) => s.data)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ order: Order; vehicleId: string; v: Validation } | null>(null)
  const [filter, setFilter] = useState<Filter>('used')
  const [tab, setTab] = useState<'unassigned' | 'plan' | 'deferred'>('plan')
  const [generating, setGenerating] = useState(false)
  const [drawer, setDrawer] = useState<Order>()
  const [deferring, setDeferring] = useState<Order>()

  const unassigned = d.orders.filter((o) => o.status === 'CONFIRMED' && !o.tripId && o.deliveryDate === d.deliveryDate).sort((a, b) => b.priority - a.priority)
  const deferred = d.orders.filter((o) => o.status === 'DEFERRED').sort((a, b) => b.priority - a.priority)
  const active = (o?: string | null) => (o ? d.orders.find((x) => x.id === o) : undefined)
  const moving = active(dragging ?? selected)

  const vehicles = useMemo(() => {
    const withTrips = new Set(d.trips.filter((t) => t.status !== 'ABORTED').map((t) => t.vehicleId))
    return d.vehicles
      .filter((v) => {
        if (filter === 'used') return withTrips.has(v.id)
        if (filter === 'reefer') return isReefer(v.type)
        if (filter === 'van') return isVan(v.type)
        if (filter === 'truck') return v.type === 'TRUCK' || v.type === 'REEFER_TRUCK'
        if (filter === 'idle') return !withTrips.has(v.id) && v.status === 'AVAILABLE'
        return true
      })
      .sort((a, b) => Number(b.status === 'AVAILABLE') - Number(a.status === 'AVAILABLE') || Number(withTrips.has(b.id)) - Number(withTrips.has(a.id)) || a.id.localeCompare(b.id))
  }, [d, filter])

  const summary = useMemo(() => {
    const trips = d.trips.filter((t) => t.status !== 'ABORTED' && t.stops.length)
    let vol = 0
    let cap = 0
    for (const t of trips) {
      const v = d.vehicles.find((x) => x.id === t.vehicleId)!
      vol += scheduleOf(d, t).volumeM3
      cap += v.capacityM3
    }
    return { served: d.orders.filter((o) => o.tripId).length, deferred: deferred.length, trips: trips.length, vehicles: new Set(trips.map((t) => t.vehicleId)).size, util: cap ? (vol / cap) * 100 : 0 }
  }, [d, deferred.length])

  const assign = (orderId: string, vehicleId: string) => {
    const o = active(orderId)
    if (!o) return
    const r = tryAssign(o, vehicleId)
    if (!r.ok) setBlocked({ order: o, vehicleId, v: r })
    setSelected(null)
  }

  useEffect(() => {
    if (d.plan !== 'NONE' && filter === 'used' && vehicles.length === 0) setFilter('all')
  }, [d.plan, filter, vehicles.length])

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Planning"
        subtitle="Drag orders onto vehicles — every allocation is validated before it’s saved."
        actions={
          <>
            <Button variant="secondary" icon={<Sparkles className="size-4" />} disabled={!d.ordersClosed} onClick={() => setGenerating(true)}>
              Generate recommended plan
            </Button>
            {d.plan === 'DRAFT' && (
              <Button
                icon={<Send className="size-4" />}
                onClick={() => {
                  ops('publishPlan')
                  toast('Plan published', { body: 'Loaders, drivers and stores have been notified.' })
                }}
              >
                Publish plan
              </Button>
            )}
            {d.plan === 'PUBLISHED' && (
              <Badge tone="success" dot>
                Published
              </Badge>
            )}
          </>
        }
      />

      {!d.ordersClosed && (
        <Callout
          tone="info"
          icon={<Lock className="size-5" />}
          title="Orders are still open"
          className="mb-4"
          action={
            <Link to="/dispatcher/orders?close=1">
              <Button size="sm">Close orders</Button>
            </Link>
          }
        >
          Close orders at the 16:00 cutoff to generate the recommended plan. You can still allocate manually.
        </Callout>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal px-3 py-1 text-white">
          <Truck className="size-3.5" /> Max 2 trips per vehicle / day
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-chocolate px-3 py-1 text-white">
          <Snowflake className="size-3.5" /> Fresh delivered before 08:00
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-bg">Trip 2 leaves after Trip 1 returns</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Served', summary.served, ''],
          ['Deferred', summary.deferred, summary.deferred ? 'text-attention-ink' : ''],
          ['Vehicles', summary.vehicles, ''],
          ['Trips', summary.trips, ''],
          ['Capacity utilization', `${summary.util.toFixed(1)}%`, 'text-brand-ink'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-xs text-muted">{l}</div>
            <div className={cn('font-display text-xl font-semibold tabular-nums', c as string)}>{v}</div>
          </div>
        ))}
      </div>

      {moving && selected && (
        <div className="sticky top-16 z-20 mb-3 flex items-center gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-2.5 text-sm shadow-card">
          <span className="flex-1">
            Assigning <b className="id">{moving.outletId}</b> — tap a vehicle below.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mb-3 xl:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'unassigned', label: `Unassigned (${unassigned.length})` },
            { value: 'plan', label: 'Vehicle plan' },
            { value: 'deferred', label: `Deferred (${deferred.length})` },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <Column title="Unassigned orders" count={unassigned.length} className={cn(tab !== 'unassigned' && 'hidden xl:flex')}>
          {unassigned.length === 0 ? (
            <EmptyState icon={<Check className="size-5" />} title="Queue is clear" body={d.plan === 'NONE' ? 'Generate a plan or allocate orders manually.' : 'Every order is allocated or deferred.'} />
          ) : (
            unassigned.map((o) => <OrderCard key={o.id} o={o} selected={selected === o.id} onSelect={() => (setSelected(selected === o.id ? null : o.id), setTab('plan'))} onOpen={() => setDrawer(o)} onDrag={setDragging} />)
          )}
        </Column>

        <div className={cn('min-w-0', tab !== 'plan' && 'hidden xl:block')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Vehicle plan</h2>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'used', label: 'In plan' },
                { value: 'idle', label: 'Idle' },
                { value: 'reefer', label: 'Reefer' },
                { value: 'truck', label: 'Trucks' },
                { value: 'van', label: 'Vans' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          {vehicles.length === 0 ? (
            <Card>
              <EmptyState icon={<Truck className="size-5" />} title="No vehicles in the plan yet" body="Generate the recommended plan, or drag an order onto an idle vehicle." action={<Button variant="secondary" onClick={() => setFilter('idle')}>Show idle vehicles</Button>} />
            </Card>
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {vehicles.map((v) => (
                <VehicleCard key={v.id} v={v} moving={moving} onDrop={(oid) => assign(oid, v.id)} onOpen={(o) => setDrawer(o)} />
              ))}
            </div>
          )}
        </div>

        <Column title="Deferred orders" count={deferred.length} tone="attention" className={cn(tab !== 'deferred' && 'hidden xl:flex')}>
          {deferred.length === 0 ? (
            <EmptyState icon={<CalendarClock className="size-5" />} title="Nothing deferred" />
          ) : (
            deferred.map((o) => (
              <div key={o.id} className="rounded-lg border border-attention/40 bg-surface p-3">
                <OrderCard o={o} compact selected={selected === o.id} onSelect={() => setSelected(selected === o.id ? null : o.id)} onOpen={() => setDrawer(o)} onDrag={setDragging} />
                <div className="mt-2 text-xs font-semibold text-attention-ink">{o.deferral?.reason}</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => (setSelected(o.id), setTab('plan'))}>
                    Reallocate
                  </Button>
                  {!o.deferral?.confirmed ? (
                    <Button size="sm" variant="attention" className="flex-1" onClick={() => (ops('confirmDeferral', o.id), toast(`${o.outletId} deferral confirmed`, { tone: 'attention', body: 'The store has been notified.' }))}>
                      Confirm
                    </Button>
                  ) : (
                    <Badge tone="attention" className="self-center">
                      Confirmed
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </Column>
      </div>

      <BlockedModal state={blocked} onClose={() => setBlocked(null)} onPick={(vid) => blocked && (setBlocked(null), assign(blocked.order.id, vid))} />
      <GeneratePlanModal open={generating} onClose={() => setGenerating(false)} />
      <OrderDrawer order={drawer} onClose={() => setDrawer(undefined)} onDefer={(o) => (setDrawer(undefined), setDeferring(o))} />
      <DeferModal key={deferring?.id} order={deferring} open={!!deferring} onClose={() => setDeferring(undefined)} />
    </>
  )
}

function Column({ title, count, tone, className, children }: { title: string; count: number; tone?: 'attention'; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('flex max-h-[calc(100dvh-220px)] min-h-72 flex-col rounded-xl border border-line bg-surface-2/60', className)}>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge tone={tone ?? 'neutral'}>{count}</Badge>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-3 pb-3">{children}</div>
    </section>
  )
}

function OrderCard({ o, selected, onSelect, onOpen, onDrag, compact }: { o: Order; selected?: boolean; onSelect: () => void; onOpen: () => void; onDrag: (id: string | null) => void; compact?: boolean }) {
  const d = useOps((s) => s.data)
  const out = outletOf(d, o.outletId)!
  const body = (
    <>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <button onClick={(e) => (e.stopPropagation(), onOpen())} className="id hover:underline">
              {out.id}
            </button>
            <span className={cn('text-xs font-semibold tabular-nums', o.priority >= 80 ? 'text-attention-ink' : 'text-muted')}>P{o.priority}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{o.brand}</Badge>
            {o.temp === 'CHILLED' && (
              <Badge tone="info">
                <Snowflake className="size-3" /> Chilled
              </Badge>
            )}
            {out.vanOnly && <Badge tone="warning">Van only</Badge>}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span className="tabular-nums">{o.volumeM3} m³ · {o.weightKg} kg</span>
            <span>by {fmtMin(out.window[1])}</span>
          </div>
        </div>
      </div>
    </>
  )
  if (compact)
    return (
      <div draggable onDragStart={(e) => (e.dataTransfer.setData('text/order', o.id), onDrag(o.id))} onDragEnd={() => onDrag(null)} className="cursor-grab">
        {body}
      </div>
    )
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/order', o.id)
        e.dataTransfer.effectAllowed = 'move'
        onDrag(o.id)
      }}
      onDragEnd={() => onDrag(null)}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      aria-pressed={selected}
      className={cn('cursor-grab rounded-lg border bg-surface p-3 shadow-sm transition active:cursor-grabbing', selected ? 'border-brand ring-3 ring-brand/20' : 'border-line hover:border-line-strong')}
    >
      {body}
    </div>
  )
}

function VehicleCard({ v, moving, onDrop, onOpen }: { v: Vehicle; moving?: Order; onDrop: (orderId: string) => void; onOpen: (o: Order) => void }) {
  const d = useOps((s) => s.data)
  const [over, setOver] = useState(false)
  const trips = d.trips.filter((t) => t.vehicleId === v.id && t.status !== 'ABORTED').sort((a, b) => a.number - b.number)
  const preview = useMemo(() => (moving ? validate(moving, v, d) : null), [moving, v, d])
  const unavailable = v.status !== 'AVAILABLE'
  const verdict = moving && preview ? (preview.ok ? 'ok' : 'blocked') : null

  return (
    <Card
      onDragOver={(e) => {
        if (unavailable) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/order')
        if (id) onDrop(id)
      }}
      className={cn(
        'p-4 transition',
        unavailable && 'opacity-55',
        over && verdict === 'ok' && 'border-success ring-3 ring-success/25',
        over && verdict === 'blocked' && 'border-critical ring-3 ring-critical/25',
        !over && moving && verdict === 'ok' && 'border-success/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="id text-[15px]">{v.id}</span>
            {isReefer(v.type) && <Snowflake className="size-3.5 text-info" aria-label="Refrigerated" />}
            {v.standby && <Badge tone="info">Standby</Badge>}
          </div>
          <div className="text-xs uppercase tracking-wide text-muted">
            {vehicleLabel(v.type)} · {v.depot} · {v.driver}
          </div>
        </div>
        {unavailable ? (
          <Badge tone="critical">{v.status.toLowerCase()}</Badge>
        ) : moving && !over ? (
          <Button size="sm" variant={verdict === 'ok' ? 'primary' : 'secondary'} onClick={() => onDrop(moving.id)}>
            {verdict === 'ok' ? 'Assign here' : 'Check'}
          </Button>
        ) : (
          <span className="text-xs text-muted">{trips.length}/2 trips</span>
        )}
      </div>

      {over && preview && (
        <div className={cn('mt-3 rounded-lg border p-3', preview.ok ? 'border-success/40 bg-success-soft' : 'border-critical/40 bg-critical-soft')}>
          <div className={cn('mb-1 text-sm font-semibold', preview.ok ? 'text-success-ink' : 'text-critical-ink')}>{preview.ok ? '✓ Order can be assigned' : 'Cannot assign order'}</div>
          {preview.checks
            .filter((c) => !preview.ok ? !c.ok : ['volume', 'weight', 'time'].includes(c.key))
            .map((c) => (
              <CheckRow key={c.key} ok={c.ok} warn={!c.blocking} label={c.label} detail={c.detail} />
            ))}
        </div>
      )}

      {trips.length === 0 && !over && <p className="mt-3 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">Drop an order to start a trip</p>}
      {trips.map((t) => (
        <TripBlock key={t.id} t={t} v={v} onOpen={onOpen} />
      ))}
    </Card>
  )
}

function TripBlock({ t, v, onOpen }: { t: Trip; v: Vehicle; onOpen: (o: Order) => void }) {
  const d = useOps((s) => s.data)
  const s = scheduleOf(d, t)
  const late = s.stops.some((x) => x.late)
  const locked = !['DRAFT', 'PLANNED'].includes(t.status)
  return (
    <div className="mt-3 rounded-lg bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold">
          Trip {t.number} · {t.brand} · {t.district}
        </span>
        <span className="text-muted">
          {fmtMin(t.departure)} → {fmtMin(s.finish)}
          {t.status !== 'DRAFT' && <Badge className="ml-2">{t.status.toLowerCase().replace('_', ' ')}</Badge>}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {t.stops.map((id, i) => {
          const o = d.orders.find((x) => x.id === id)!
          const st = s.stops.find((x) => x.orderId === id)
          return (
            <span key={id} className={cn('group inline-flex items-center gap-1 rounded-md border bg-surface py-0.5 pl-2 pr-1 text-xs', st?.late ? 'border-critical/50' : 'border-line')}>
              <span className="text-faint">{i + 1}</span>
              <button className="id hover:underline" onClick={() => onOpen(o)}>
                {o.outletId}
              </button>
              {!locked && (
                <button aria-label={`Remove ${o.outletId}`} className="rounded p-0.5 text-faint hover:bg-surface-2 hover:text-critical" onClick={() => (ops('unassign', id), toast(`${o.outletId} returned to queue`, { tone: 'neutral' }))}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          )
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Meter label="Weight" value={s.weightKg} max={v.capacityKg} detail={`${s.weightKg.toLocaleString()} / ${v.capacityKg.toLocaleString()} kg`} />
        <Meter label="Volume" value={s.volumeM3} max={v.capacityM3} detail={`${s.volumeM3} / ${v.capacityM3} m³`} />
        <Meter label="Time" value={s.totalMin} max={TRIP_LIMIT_MIN} detail={`${Math.round(s.totalMin)} / ${TRIP_LIMIT_MIN} min`} />
      </div>
      {late && <p className="mt-2 text-xs font-semibold text-critical-ink">A stop misses its delivery window.</p>}
      {s.stops.some((x) => x.freshLate) && <p className="mt-2 text-xs font-semibold text-critical-ink">A Fresh stop finishes after 08:00.</p>}
      {t.brand === 'Fresh' && !s.stops.some((x) => x.freshLate) && s.stops.length > 0 && (
        <p className="mt-2 text-xs text-muted">Fresh done by {fmtMin(s.stops[s.stops.length - 1].start + s.stops[s.stops.length - 1].service)} · deadline 08:00</p>
      )}
    </div>
  )
}

const PLAN_STEPS = ['Fleet availability', 'Capacity', 'Refrigeration', 'Access restrictions', 'Delivery windows', 'Fuel quotas', 'Priority']

function GeneratePlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useOps((s) => s.data)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof ops<'generatePlan'>> | null>(null)
  const queue = d.orders.filter((o) => o.status === 'CONFIRMED' || (o.status === 'DEFERRED' && !o.deferral?.confirmed) || (o.status === 'PLANNED' && d.plan === 'DRAFT')).length
  useEffect(() => {
    if (!open) {
      setStep(0)
      setResult(null)
      return
    }
    if (step < PLAN_STEPS.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 280)
      return () => clearTimeout(t)
    }
    if (!result) setResult(ops('generatePlan'))
  }, [open, step, result])

  const util = useMemo(() => {
    if (!result) return 0
    let vol = 0
    let cap = 0
    for (const t of d.trips.filter((x) => x.status === 'DRAFT')) {
      const v = d.vehicles.find((x) => x.id === t.vehicleId)!
      vol += scheduleOf(d, t).volumeM3
      cap += v.capacityM3
    }
    return cap ? (vol / cap) * 100 : 0
  }, [result, d])

  return (
    <Modal open={open} onClose={onClose} eyebrow="Recommended plan" title={result ? 'Plan ready' : `Analyzing ${queue} orders…`} footer={result && <Button onClick={onClose}>Review plan</Button>}>
      {!result ? (
        <div>
          <div className="eyebrow mb-2">Checking</div>
          {PLAN_STEPS.map((s, i) => (
            <div key={s} className={cn('flex items-center gap-3 py-1.5 text-sm transition', i < step ? 'text-ink' : 'text-faint')}>
              <span className={cn('grid size-5 place-items-center rounded-full', i < step ? 'bg-success-soft text-success-ink' : 'border-2 border-line-strong')}>{i < step && <Check className="size-3" strokeWidth={3} />}</span>
              {s}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Big label="Served" value={result.served} tone="text-brand-ink" />
          <Big label="Deferred" value={result.deferred} tone="text-attention-ink" />
          <Big label="Vehicles" value={result.vehicles} />
          <Big label="Trips" value={result.trips} />
          <div className="col-span-2 rounded-xl bg-brand-soft p-4">
            <div className="font-display text-3xl font-semibold text-brand-ink">{util.toFixed(1)}%</div>
            <div className="text-sm text-brand-ink">Capacity utilization</div>
          </div>
          {result.deferred > 0 && <p className="col-span-2 text-sm text-muted">Deferrals are proposals until you confirm them or publish the plan. Each carries a reason the store will see.</p>}
        </div>
      )}
    </Modal>
  )
}

function Big({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className={cn('font-display text-3xl font-semibold tabular-nums', tone)}>{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  )
}
