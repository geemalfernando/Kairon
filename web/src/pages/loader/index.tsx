import { WorkflowEntry } from '../shared/Workflow'
import { ArrowDown, ArrowLeft, Check, ChevronRight, CloudOff, Minus, Package, PackageCheck, Plus, Snowflake, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuditTimeline } from '../../components/AuditTimeline'
import { PhotoCapture } from '../../components/ProofCapture'
import { RouteMap } from '../../components/RouteMap'
import { Badge, Button, Callout, Card, CardHeader, ChoiceList, cn, EmptyState, Modal, PageHeader, Segmented, SeverityBadge, Stat, toast } from '../../components/ui'
import { isReefer, vehicleLabel } from '../../domain/seed'
import { fmtMin, greeting, timeAgo } from '../../domain/time'
import type { Depot, Order, Trip } from '../../domain/types'
import { orderOf, outletOf, vehicleOf } from '../../lib/select'
import { useDevice, useNetwork, useSession, useView } from '../../store'
import type { OpsData } from '../../store/events'
import { tripLabel, tripTone } from '../dispatcher/Routes'

const loaderTrips = (d: OpsData, depot: Depot) => d.trips.filter((t) => d.vehicles.find((v) => v.id === t.vehicleId)?.depot === depot && !['DRAFT', 'ABORTED'].includes(t.status) && t.stops.length).sort((a, b) => a.departure - b.departure || a.vehicleId.localeCompare(b.vehicleId))

function NotReleased() {
  return (
    <Card>
      <EmptyState
        icon={<Package className="size-5" />}
        title="Tomorrow’s plan hasn’t been released yet"
        body="Trips appear here the moment the dispatcher publishes the plan — with the stop sequence you need to load in."
      />
    </Card>
  )
}

export function Dashboard() {
  const d = useView()
  const user = useSession((s) => s.user)!
  const trips = loaderTrips(d, user.depot)
  const ready = trips.filter((t) => t.status === 'PLANNED')
  const loading = trips.filter((t) => t.status === 'LOADING')
  const done = trips.filter((t) => ['LOADED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(t.status))
  const next = [...loading, ...ready].slice(0, 6)
  return (
    <>
      <WorkflowEntry />
      <PageHeader eyebrow={greeting()} title={`${user.depot} loading bay`} subtitle={`${trips.length} trips today`} />
      {trips.length === 0 ? (
        <NotReleased />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <Stat label="Ready to load" value={ready.length} tone="brand" />
            <Stat label="Loading" value={loading.length} tone="warning" />
            <Stat label="Completed" value={done.length} tone="success" />
          </div>
          <h2 className="mb-3 text-sm font-semibold">Up next</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {next.map((t) => (
              <TripCard key={t.id} t={t} />
            ))}
            {next.length === 0 && <p className="text-sm text-muted">All trips are loaded. Nice work.</p>}
          </div>
        </>
      )}
    </>
  )
}

function TripCard({ t }: { t: Trip }) {
  const d = useView()
  const v = vehicleOf(d, t.vehicleId)!
  return (
    <Link to={`/loader/load/${t.id}`} className="group">
      <Card className="flex items-center gap-4 p-5 transition group-hover:border-brand">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="id text-xl">{t.vehicleId}</span>
            {isReefer(v.type) && <Snowflake className="size-4 text-info" />}
            <Badge tone={tripTone[t.status]} dot>
              {tripLabel(t.status)}
            </Badge>
          </div>
          <div className="mt-0.5 text-sm text-muted">
            Trip {t.number} · {t.brand} · {t.district} · {t.stops.length} stops
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold tabular-nums">{fmtMin(t.departure)}</div>
          <div className="text-xs text-muted">departure</div>
        </div>
        <ChevronRight className="size-5 text-faint" />
      </Card>
    </Link>
  )
}

export function Trips() {
  const depot = useSession((s) => s.user!.depot)
  const d = useView()
  const [f, setF] = useState<'todo' | 'done' | 'all'>('todo')
  const trips = loaderTrips(d, depot).filter((t) => (f === 'todo' ? ['PLANNED', 'LOADING'].includes(t.status) : f === 'done' ? !['PLANNED', 'LOADING'].includes(t.status) : true))
  return (
    <>
      <PageHeader
        eyebrow="Loading"
        title="Trips"
        actions={
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: 'todo', label: 'To load' },
              { value: 'done', label: 'Loaded' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      {loaderTrips(d, depot).length === 0 ? (
        <NotReleased />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {trips.map((t) => (
            <TripCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </>
  )
}

export function Load() {
  const depot = useSession((s) => s.user!.depot)
  const { tripId } = useParams()
  const d = useView()
  const record = useDevice((s) => s.record)
  const net = useNetwork()
  const t = d.trips.find((x) => x.id === tripId && d.vehicles.find((v) => v.id === x.vehicleId)?.depot === depot)
  const [open, setOpen] = useState<string | null>(null)
  const [short, setShort] = useState<{ o: Order; item: string; available: number } | null>(null)

  if (!t) return <EmptyState icon={<Package className="size-5" />} title="Trip not found" />
  const v = vehicleOf(d, t.vehicleId)!
  const orders = t.stops.map((id) => orderOf(d, id)!).filter(Boolean)
  const loadOrder = [...orders].reverse() // last stop goes in first
  const confirmedCount = orders.filter((o) => isOrderConfirmed(o)).length
  const blockedShortfalls = orders.filter((o) => o.shortfall && !o.shortfall.decision)
  const canComplete = orders.length > 0 && confirmedCount === orders.length && !blockedShortfalls.length && t.status === 'LOADING'
  const current = open ?? loadOrder.find((o) => !isOrderConfirmed(o))?.id ?? null
  const shortIssue = (o: Order) => d.issues.find((i) => i.kind === 'SHORTFALL' && i.orderIds?.includes(o.id))

  return (
    <>
      <Link to="/loader/trips" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Trips
      </Link>
      <PageHeader
        eyebrow={`${vehicleLabel(v.type)} · ${v.driver}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="id">{t.vehicleId}</span>
            <span className="text-muted">Trip {t.number}</span>
            <Badge tone={tripTone[t.status]} dot>
              {tripLabel(t.status)}
            </Badge>
          </span>
        }
        subtitle={`${t.brand} · ${t.district} · departure ${fmtMin(t.departure)} · ${t.stops.length} stops`}
      />

      {t.status === 'PLANNED' && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
          <div className="flex-1">
            <div className="font-semibold">Ready to load</div>
            <p className="text-sm text-muted">Load in reverse stop order so the first delivery comes off first.</p>
          </div>
          <Button size="xl" onClick={() => (record({ type: 'LOAD_START', tripId: t.id }), toast('Loading started', { tone: 'info' }))}>
            Start loading
          </Button>
        </Card>
      )}
      {!net.online && t.status !== 'PLANNED' && (
        <Callout tone="neutral" icon={<CloudOff className="size-5" />} title="Working offline" className="mb-4">
          Counts and shortfalls are saved on this terminal and sent when the connection returns.
        </Callout>
      )}

      <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]', t.status === 'PLANNED' && 'pointer-events-none opacity-60')}>
        <Card className="self-start">
          <CardHeader title="Loading sequence" eyebrow={`${confirmedCount}/${orders.length} confirmed`} />
          <div className="bg-brand-soft px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-ink">Load first</div>
          <ol>
            {loadOrder.map((o) => {
              const stop = t.stops.indexOf(o.id) + 1
              const ok = isOrderConfirmed(o)
              return (
                <li key={o.id}>
                  <button onClick={() => setOpen(o.id)} className={cn('flex w-full items-center gap-4 border-b border-line px-5 py-4 text-left transition', current === o.id ? 'bg-surface-2' : 'hover:bg-surface-2')}>
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold', ok ? 'bg-success text-white' : current === o.id ? 'bg-brand text-white' : 'bg-surface-3')}>{ok ? <Check className="size-5" strokeWidth={3} /> : stop}</span>
                    <span className="min-w-0 flex-1">
                      <span className="id text-base">{o.outletId}</span>
                      <span className="block truncate text-xs text-muted">{outletOf(d, o.outletId)?.name}</span>
                    </span>
                    {o.shortfall && <Badge tone="attention">Shortfall</Badge>}
                    {o.temp === 'CHILLED' && <Snowflake className="size-4 text-info" />}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="flex items-center gap-2 bg-surface-2 px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
            <ArrowDown className="size-3.5" /> Unload first (stop 1)
          </div>
        </Card>

        <div className="space-y-4">
          {current && (
            <OrderLoader
              key={current}
              o={orders.find((x) => x.id === current)!}
              stop={t.stops.indexOf(current) + 1}
              issue={shortIssue(orders.find((x) => x.id === current)!)}
              onShort={(item, available) => setShort({ o: orders.find((x) => x.id === current)!, item, available })}
              onConfirmed={() => setOpen(loadOrder.find((o) => o.id !== current && !isOrderConfirmed(o))?.id ?? null)}
            />
          )}
          <Button
            size="xl"
            block
            icon={<PackageCheck className="size-5" />}
            disabled={!canComplete}
            onClick={() => {
              record({ type: 'LOAD_COMPLETE', tripId: t.id })
              toast(`${t.vehicleId} loading complete`, { body: net.online ? 'Driver and stores notified.' : 'Saved offline — will sync.' })
            }}
          >
            {t.status === 'LOADED' || t.status === 'IN_PROGRESS' ? 'Loading complete' : `Complete loading (${confirmedCount}/${orders.length})`}
          </Button>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader title="On the road" eyebrow="Delivery order — stop 1 comes off first" />
        <div className="p-4">
          <RouteMap className="h-72" routes={[{ id: t.id, depot: v.depot, stops: orders.map((o) => ({ outlet: outletOf(d, o.outletId)!, state: 'todo' as const })) }]} />
        </div>
      </Card>
      {blockedShortfalls.length > 0 && <Callout tone="warning" title="Waiting for a shortfall decision" className="mt-4">{blockedShortfalls.length} orders need dispatcher review. Counts are saved; departure stays blocked until the shortfall is resolved. <Link to="/loader/issues" className="underline">View loading issues</Link></Callout>}
      {short && <ShortfallModal {...short} onClose={() => setShort(null)} />}
    </>
  )
}

const isOrderConfirmed = (o: Order) => !!o.loaded && o.items.every((i) => o.loaded![i.name] !== undefined)

function OrderLoader({ o, stop, issue, onShort, onConfirmed }: { o: Order; stop: number; issue?: { resolved?: { decision: string } }; onShort: (item: string, available: number) => void; onConfirmed: () => void }) {
  const d = useView()
  const record = useDevice((s) => s.record)
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(o.items.map((i) => [i.name, o.loaded?.[i.name] ?? 0])))
  const out = outletOf(d, o.outletId)!
  const missing = o.items.filter((i) => counts[i.name] < i.qty)
  const unresolvedMissing = missing.filter((i) => o.shortfall?.item !== i.name)
  return (
    <Card>
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div>
          <div className="eyebrow">Stop {stop}</div>
          <div className="id text-2xl">{out.id}</div>
          <div className="text-sm text-muted">{out.name}</div>
        </div>
        {o.temp === 'CHILLED' && (
          <Badge tone="info">
            <Snowflake className="size-3" /> Chilled
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-line">
        {o.items.map((i) => {
          const c = counts[i.name]
          const set = (n: number) => setCounts((s) => ({ ...s, [i.name]: Math.max(0, Math.min(i.qty, n)) }))
          const full = c >= i.qty
          return (
            <li key={i.name} className="px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-semibold">{i.name}</div>
                  <div className={cn('text-sm tabular-nums', full ? 'text-success-ink' : 'text-muted')}>
                    {c} / {i.qty} {i.unit}
                  </div>
                </div>
                <div className="inline-flex items-center rounded-xl border border-line-strong">
                  <button className="grid size-12 place-items-center" onClick={() => set(c - 1)} aria-label={`Remove one ${i.name}`}>
                    <Minus className="size-5" />
                  </button>
                  <span className="w-10 text-center text-lg font-semibold tabular-nums">{c}</span>
                  <button className="grid size-12 place-items-center" onClick={() => set(c + 1)} aria-label={`Add one ${i.name}`}>
                    <Plus className="size-5" />
                  </button>
                </div>
                <Button variant={full ? 'secondary' : 'primary'} className="h-12" onClick={() => set(i.qty)} disabled={full}>
                  All
                </Button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={cn('h-full rounded-full transition-all', full ? 'bg-success' : 'bg-brand')} style={{ width: `${(c / i.qty) * 100}%` }} />
              </div>
              {!full && o.shortfall?.item !== i.name && (
                <button onClick={() => onShort(i.name, c)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-attention-ink">
                  <TriangleAlert className="size-4" /> {i.qty - c} missing — report shortfall
                </button>
              )}
              {o.shortfall?.item === i.name && (
                <div className="mt-2 text-sm text-attention-ink">
                  Shortfall reported · {issue?.resolved ? `Dispatcher: ${issue.resolved.decision}` : 'awaiting dispatcher decision'}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line p-5">
        {unresolvedMissing.length > 0 ? (
          <p className="text-sm text-muted">Count every item, or report a shortfall for anything missing, to confirm this stop.</p>
        ) : (
          <Button
            block
            size="lg"
            onClick={() => {
              for (const i of o.items) record({ type: 'LOAD_COUNT', orderId: o.id, item: i.name, count: counts[i.name] })
              toast(`${out.id} confirmed`)
              onConfirmed()
            }}
          >
            {isOrderConfirmed(o) ? 'Update counts' : `Confirm ${out.id}`}
          </Button>
        )}
      </div>
    </Card>
  )
}

const REASONS = ['Inventory unavailable', 'Damaged item', 'Wrong item', 'Missing stock', 'Other'] as const

function ShortfallModal({ o, item, available, onClose }: { o: Order; item: string; available: number; onClose: () => void }) {
  const record = useDevice((s) => s.record)
  const net = useNetwork()
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null)
  const [photo, setPhoto] = useState<string>()
  const expected = o.items.find((i) => i.name === item)!.qty
  const submit = () => {
    record({ type: 'SHORTFALL', orderId: o.id, item, missing: expected - available, reason: reason!, photo })
    toast(net.online ? 'Dispatcher notified' : 'Saved offline', { tone: 'attention', body: `${o.outletId}: ${expected - available} × ${item} short` })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={o.outletId}
      title="Loading shortfall"
      tone="attention"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="attention" disabled={!reason} onClick={submit}>
            {net.online ? 'Notify dispatcher' : 'Save offline'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Expected', expected],
          ['Available', available],
          ['Shortfall', expected - available],
        ].map(([l, v], i) => (
          <div key={l} className={cn('rounded-xl p-3', i === 2 ? 'bg-attention-soft text-attention-ink' : 'bg-surface-2')}>
            <div className="text-xs opacity-80">{l}</div>
            <div className="font-display text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-sm text-muted">{item}</p>
      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">Reason</div>
        <ChoiceList name="Shortfall reason" columns={2} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
      </div>
      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">Photo</div>
        <PhotoCapture value={photo} onChange={setPhoto} label="Capture" />
      </div>
    </Modal>
  )
}

export function Issues() {
  const d = useView()
  const list = d.issues.filter((i) => i.kind === 'SHORTFALL')
  return (
    <>
      <PageHeader eyebrow="Loading" title="Issues" subtitle="Shortfalls you’ve reported and the dispatcher’s decisions." />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<TriangleAlert className="size-5" />} title="No shortfalls reported" body="Report a shortfall from any stop while loading." />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <SeverityBadge s={i.severity} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{i.title}</div>
                <div className="text-sm text-muted">{i.detail}</div>
              </div>
              {i.resolved ? <Badge tone="success">{i.resolved.decision}</Badge> : <Badge tone="warning">Awaiting decision</Badge>}
              <span className="text-xs text-faint">{timeAgo(i.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}

export function History() {
  const d = useView()
  const events = useMemo(() => d.audit.filter((e) => e.actor === 'LOADER').sort((a, b) => a.at - b.at), [d])
  return (
    <>
      <PageHeader eyebrow="Records" title="Loading history" />
      <Card className="p-5">
        <AuditTimeline events={events.map((e) => ({ ...e, text: `${e.entity} · ${e.text}` }))} empty="Nothing loaded yet today." />
      </Card>
    </>
  )
}
