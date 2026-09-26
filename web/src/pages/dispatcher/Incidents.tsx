import { Activity, ArrowLeft, BrainCircuit, CheckCircle2, CircleDashed, Pause, Play, Radar, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TrailMap } from '../../components/RouteMap'
import { Badge, Button, Card, CardHeader, cn, EmptyState, Field, PageHeader, Segmented, Select, SeverityBadge, severityTone, Textarea, toast, toneBorder, type Tone } from '../../components/ui'
import { FEATURES } from '../../domain/incidents/classifier'
import { buildCaseFile, ensureDesk, retrain, reviewCase, RULES, setSpeed, simNow, startLiveDay } from '../../domain/incidents/engine'
import { km, lkr, orderValue, simulateTrip, unitPrice } from '../../domain/incidents/sim'
import { RESPONSIBILITIES, RESPONSIBILITY_LABEL, SIGNAL_LABEL, type Check, type IncidentCase, type Responsibility, type ResolutionAction, type Scenario } from '../../domain/incidents/types'
import { DEPOT_GEO, outletGeo } from '../../domain/geo'
import { byId } from '../../domain/rules'
import { fmtClock, fmtMin, timeAgo } from '../../domain/time'
import { useOps } from '../../store'
import { desk } from '../../store/desk'

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const ACTION: Record<ResolutionAction, { label: string; tone: Tone }> = {
  INSTANT_REFUND: { label: 'Instant credit', tone: 'success' },
  ZONE_NOTICE: { label: 'Zone notice', tone: 'warning' },
  PROACTIVE_NOTICE: { label: 'Store warned early', tone: 'info' },
  REATTEMPT: { label: 'Re-attempt', tone: 'neutral' },
  HUMAN_REVIEW: { label: 'Needs review', tone: 'critical' },
  NO_ACTION: { label: 'Closed · no action', tone: 'neutral' },
}
const WHO_TONE: Record<Responsibility, Tone> = { RIDER: 'attention', OPERATIONS: 'brand', MERCHANT: 'info', EXTERNAL: 'warning' }

const PIPELINE = ['Watch live deliveries', 'Flag problems early', 'Assemble the case', 'Run five checks', 'Predict responsibility', 'Apply resolution rules']

// ---------------------------------------------------------------------------
// Desk
// ---------------------------------------------------------------------------

export function Incidents() {
  const d = useOps((s) => s.data)
  const now = useNow()
  const state = d.desk
  const t = simNow(state, now)
  const [tab, setTab] = useState<'all' | 'REVIEW' | 'WATCHING' | 'RESOLVED'>('all')
  const cases = state?.cases ?? []
  const shown = tab === 'all' ? cases : cases.filter((c) => c.state === tab)
  const live = Object.keys(state?.scenarios ?? {}).filter((id) => byId(d.trips, id)?.status === 'IN_PROGRESS').length
  const early = cases.filter((c) => !c.complaintBeforeDetection)
  const credits = (state?.credits ?? []).filter((c) => c.caseId)

  if (!state?.live.startedAt) {
    return (
      <>
        <PageHeader eyebrow="Monitoring" title="Incident desk" subtitle="Catch delivery problems before stores complain, and resolve them fairly." />
        <Card className="p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Start the delivery day under watch</h2>
              <p className="mt-2 max-w-xl text-muted">The desk follows every vehicle's GPS trail and ETA. When something goes wrong it builds the case file, runs five checks, predicts who is responsible with a model trained on this device, and applies your resolution rules — credits, zone-wide notices or human review.</p>
              <Button size="lg" className="mt-6" icon={<Play className="size-4" />} onClick={() => (desk((dd) => startLiveDay(dd)), toast('Live watch started', { body: 'The operations clock runs at 2 minutes per second.' }))}>
                Start live day
              </Button>
              <p className="mt-3 text-xs text-muted">Publishes the plan if needed and sends the fleet out (except VEH014, which the demo driver drives by hand).</p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {PIPELINE.map((p, i) => (
                <li key={p} className="flex items-center gap-3 rounded-xl border border-line bg-bg p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal font-display text-sm font-bold text-white">{i + 1}</span>
                  <span className="text-sm font-semibold">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Incident desk"
        subtitle="Problems are flagged from GPS and ETAs, then resolved by explicit rules."
        actions={
          <>
            <Link to="/dispatcher/incidents/model">
              <Button variant="secondary" icon={<BrainCircuit className="size-4" />}>
                Model & rules
              </Button>
            </Link>
            <Segmented
              value={String(state.live.running ? state.live.speed : 0)}
              onChange={(v) => desk((dd) => setSpeed(dd, Number(v)))}
              options={[
                { value: '0', label: <Pause className="size-3.5" /> },
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
                { value: '5', label: '5×' },
              ]}
            />
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-ink px-4 py-3 text-sm text-bg">
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className={cn('size-2.5 rounded-full', state.live.running ? 'animate-pulse bg-success' : 'bg-steel')} />
          {state.live.running ? 'Watching' : 'Paused ·'} {live} live {live === 1 ? 'delivery run' : 'delivery runs'}
        </span>
        <span className="font-mono text-base font-bold tabular-nums">Ops clock {t != null ? fmtMin(t) : '—'}</span>
        <span className="opacity-70">Last scan {state.lastScan ? `${Math.max(0, Math.round((now - state.lastScan) / 1000))}s ago` : '—'}</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Problems flagged" value={cases.length} />
        <Tile label="Caught before a complaint" value={cases.length ? `${Math.round((early.length / cases.length) * 100)}%` : '—'} tone="brand" />
        <Tile label="Resolved automatically" value={cases.filter((c) => c.state === 'RESOLVED' && c.resolution?.by === 'AUTO').length} tone="success" />
        <Tile label="Needs review" value={cases.filter((c) => c.state === 'REVIEW').length} tone={cases.some((c) => c.state === 'REVIEW') ? 'critical' : 'neutral'} />
        <Tile label="Credits issued" value={lkr(credits.reduce((s, c) => s + c.amount, 0))} small />
        <Tile label="Zone notices" value={state.notices.length} tone={state.notices.length ? 'warning' : 'neutral'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Case queue"
            eyebrow={`${shown.length} of ${cases.length}`}
            action={
              <Segmented
                size="sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'REVIEW', label: 'Review' },
                  { value: 'WATCHING', label: 'Watching' },
                  { value: 'RESOLVED', label: 'Resolved' },
                ]}
              />
            }
          />
          {shown.length === 0 ? (
            <EmptyState icon={<Radar className="size-5" />} title={cases.length ? 'Nothing in this view' : 'All clear so far'} body="The watcher scans every vehicle every few seconds. Cases appear here the moment a delivery looks at risk." />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {state.notices.length > 0 && (
            <Card>
              <CardHeader title="Zone-wide notices" eyebrow="One message instead of dozens of calls" />
              <ul className="divide-y divide-line">
                {state.notices.map((n) => (
                  <li key={n.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{n.district}</span>
                      <Badge tone="warning" dot>
                        +{n.delayMin} min
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {n.cause}. Sent at {fmtMin(n.sim)} to {n.outletIds.length} stores covering {n.orderIds.length} deliveries. No individual credits for an external cause.
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Live feed" eyebrow="What the watcher did" action={<Activity className="size-4 text-muted" />} />
            <ul className="scroll-thin max-h-[420px] divide-y divide-line overflow-y-auto">
              {state.feed.map((f, i) => (
                <li key={i} className="flex gap-3 px-5 py-2.5 text-sm">
                  <span className="w-11 shrink-0 font-mono text-xs font-semibold tabular-nums text-muted">{fmtMin(f.sim)}</span>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', { info: 'bg-info', warning: 'bg-warning', critical: 'bg-critical', success: 'bg-success' }[f.tone])} />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}

function Tile({ label, value, tone = 'neutral', small }: { label: string; value: React.ReactNode; tone?: Tone; small?: boolean }) {
  return (
    <Card className="p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn('mt-2 font-display font-semibold tabular-nums', small ? 'text-xl' : 'text-[28px] leading-none', tone !== 'neutral' && { brand: 'text-brand-ink', success: 'text-success-ink', critical: 'text-critical-ink', warning: 'text-warning-ink', info: 'text-info-ink', attention: 'text-attention-ink' }[tone])}>{value}</div>
    </Card>
  )
}

function CaseRow({ c }: { c: IncidentCase }) {
  const d = useOps((s) => s.data)
  const out = byId(d.outlets, c.outletId)
  const first = c.signals[0]
  const a = c.resolution ? ACTION[c.resolution.action] : null
  return (
    <li>
      <Link to={`/dispatcher/incidents/${c.id}`} className={cn('block border-l-4 px-5 py-4 transition hover:bg-surface-2', toneBorder[severityTone[c.severity]])}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="id text-sm">{c.id}</span>
          <SeverityBadge s={c.severity} />
          <span className="font-semibold">
            {c.outletId} · {out?.name}
          </span>
          <span className="ml-auto font-mono text-xs text-muted">{fmtMin(c.openedSim)}</span>
        </div>
        <div className="mt-1 text-sm text-muted">
          {SIGNAL_LABEL[first.kind]} — {first.detail}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.complaintBeforeDetection ? <Badge tone="neutral">Raised by store</Badge> : c.leadMin != null && c.leadMin > 0 ? <Badge tone="brand">Flagged {c.leadMin} min before promise</Badge> : <Badge tone="brand">Flagged by watcher</Badge>}
          {c.prediction && (
            <Badge tone={WHO_TONE[c.review?.label ?? c.prediction.top]}>
              {c.review ? 'Reviewed: ' : ''}
              {RESPONSIBILITY_LABEL[c.review?.label ?? c.prediction.top].split(' (')[0]}
              {!c.review && ` · ${Math.round(c.prediction.confidence * 100)}%`}
            </Badge>
          )}
          {a && (
            <Badge tone={a.tone} dot>
              {a.label}
              {c.resolution?.amount ? ` · ${lkr(c.resolution.amount)}` : ''}
            </Badge>
          )}
        </div>
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Case file
// ---------------------------------------------------------------------------

const CHECK_ICON = {
  pass: <CheckCircle2 className="size-5 text-success" />,
  warn: <ShieldAlert className="size-5 text-warning" />,
  fail: <XCircle className="size-5 text-critical" />,
  pending: <CircleDashed className="size-5 text-faint" />,
}

export function IncidentCaseView() {
  const { id } = useParams()
  const d = useOps((s) => s.data)
  const now = useNow(2000)
  const c = d.desk?.cases.find((x) => x.id === id)
  const t = simNow(d.desk, now) ?? 0
  const cf = useMemo(() => (c ? buildCaseFile(structuredClone(d), c, t) : null), [c, d, t])
  if (!c || !cf) return <EmptyState icon={<Radar className="size-5" />} title="Case not found" action={<Link to="/dispatcher/incidents">Back to the desk</Link>} />
  const order = cf.order
  const out = byId(d.outlets, order.outletId)!
  const vehicle = byId(d.vehicles, c.vehicleId)!
  const scenario = d.desk!.scenarios[c.tripId] as Scenario | undefined
  const sim = scenario ? simulateTrip(d, cf.trip, scenario) : undefined
  const trail = sim ? sim.trail.filter((p) => p.t <= t) : []
  const plan = [DEPOT_GEO[vehicle.depot], ...cf.trip.stops.map((sid) => outletGeo(byId(d.outlets, byId(d.orders, sid)!.outletId)!))]
  const stills = c.signals.filter((s) => s.kind === 'STATIONARY').map((s) => {
    const p = trail.reduce((best, x) => (Math.abs(x.t - s.sim) < Math.abs(best.t - s.sim) ? x : best), trail[0])
    return { at: [p.lat, p.lng] as [number, number], label: `Stopped ${fmtMin(s.sim)}` }
  })
  const ghost = cf.finished && cf.stop && !cf.stop.inGeofence ? cf.stop.deliveredAt : undefined
  const value = orderValue(order)
  const who = c.review?.label ?? c.prediction?.top

  return (
    <>
      <Link to="/dispatcher/incidents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Incident desk
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge s={c.severity} />
            <span>
              Detected {fmtMin(c.openedSim)} ops clock · {c.complaintBeforeDetection ? 'raised by the store' : c.leadMin != null && c.leadMin > 0 ? `${c.leadMin} min before the promise, before any complaint` : 'by the watcher'}
            </span>
          </span>
        }
        title={
          <span>
            <span className="id">{c.id}</span> · {out.name}
          </span>
        }
        subtitle={`${order.id} · ${out.id} · ${out.district} · ${vehicle.id} (${vehicle.driver}) · ${c.signals.map((s) => SIGNAL_LABEL[s.kind]).join(' · ')}`}
      />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Rider GPS trail" eyebrow={`${trail.length} fixes · ${cf.trip.id}`} />
            <div className="p-4">
              {sim ? <TrailMap className="h-[420px]" plan={plan} trail={trail} outlet={out} depot={vehicle.depot} deliveredAt={ghost} stills={stills} /> : <p className="text-sm text-muted">No GPS trail for this vehicle.</p>}
              {ghost && <p className="mt-2 text-sm font-semibold text-critical-ink">Marked delivered {Math.round(km(ghost, outletGeo(out)) * 1000)} m from the store — outside the 150 m geofence.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" eyebrow="Timestamps from the order, loader, GPS and driver app" />
            <ol className="relative mx-5 my-4 border-l-2 border-line pl-5">
              {cf.timeline.map((e, i) => (
                <li key={i} className="relative pb-3 last:pb-0">
                  <span className={cn('absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-surface', e.tone === 'bad' ? 'bg-critical' : e.tone === 'ok' ? 'bg-success' : 'bg-brand')} />
                  <span className="mr-3 font-mono text-xs font-semibold tabular-nums text-muted">{e.t != null ? fmtMin(e.t) : e.at ? fmtClock(e.at) : ''}</span>
                  <span className="text-sm">{e.text}</span>
                </li>
              ))}
              {c.signals.map((s, i) => (
                <li key={`s${i}`} className="relative pb-3 last:pb-0">
                  <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-surface bg-attention" />
                  <span className="mr-3 font-mono text-xs font-semibold tabular-nums text-muted">{fmtMin(s.sim)}</span>
                  <span className="text-sm font-semibold">Flag: {SIGNAL_LABEL[s.kind]}</span> <span className="text-sm text-muted">— {s.detail}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Order & merchant" eyebrow={`Order value ${lkr(value)}`} />
            <div className="grid gap-6 p-5 md:grid-cols-2">
              <div>
                <div className="eyebrow mb-2">Items</div>
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {order.items.map((i) => (
                    <li key={i.name} className="flex justify-between px-3 py-2">
                      <span>
                        {i.name} <span className="text-muted">× {i.qty}</span>
                      </span>
                      <span className="tabular-nums text-muted">{lkr(unitPrice(i.name) * i.qty)}</span>
                    </li>
                  ))}
                </ul>
                {order.shortfall && <p className="mt-2 text-sm font-semibold text-attention-ink">Loaded short: {order.shortfall.missing} × {order.shortfall.item}</p>}
              </div>
              <div>
                <div className="eyebrow mb-2">Merchant</div>
                <p className="font-semibold">{out.name}</p>
                <p className="text-sm text-muted">
                  {out.id} · {out.district} · manager {out.manager} · window {fmtMin(out.window[0])}–{fmtMin(out.window[1])}
                </p>
                <div className="eyebrow mb-2 mt-4">Credit history · last 90 days</div>
                {cf.credits90.length === 0 ? (
                  <p className="text-sm text-muted">No credits.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {cf.credits90.map((cr) => (
                      <li key={cr.id} className="flex justify-between gap-3 px-3 py-2">
                        <span>
                          {cr.reason}
                          <span className="block text-xs text-muted">{timeAgo(cr.at)}</span>
                        </span>
                        <span className="tabular-nums">{lkr(cr.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted">Network average: {cf.networkAvgCredits.toFixed(1)} credits per store.</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ResolutionCard c={c} value={value} />

          {c.prediction && (
            <Card>
              <CardHeader title="Who is responsible?" eyebrow={`Local model v${c.prediction.modelVersion} · runs on this device`} action={<Link to="/dispatcher/incidents/model" className="text-sm font-medium text-brand-ink">Model card</Link>} />
              <div className="space-y-3 p-5">
                {RESPONSIBILITIES.map((r) => {
                  const p = c.prediction!.probs[r]
                  const top = r === c.prediction!.top
                  return (
                    <div key={r}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className={cn(top && 'font-semibold')}>{RESPONSIBILITY_LABEL[r]}</span>
                        <span className="font-mono tabular-nums">{Math.round(p * 100)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div className={cn('h-full rounded-full', top ? 'bg-brand' : 'bg-steel')} style={{ width: `${p * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
                {c.prediction.factors.length > 0 && (
                  <div className="rounded-lg bg-surface-2 p-3 text-sm">
                    <div className="mb-1 font-semibold">Why</div>
                    <ul className="space-y-0.5 text-muted">
                      {c.prediction.factors.map((f) => (
                        <li key={f.feature}>
                          {f.feature}: <b className="text-ink">{f.value}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.review && <p className="text-sm font-semibold text-brand-ink">Reviewer set responsibility to {RESPONSIBILITY_LABEL[c.review.label].toLowerCase()}.</p>}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Five checks" eyebrow="Evidence behind the decision" />
            <ul className="divide-y divide-line">
              {c.checks.map((k) => (
                <CheckItem key={k.id} k={k} />
              ))}
            </ul>
          </Card>

          <ReviewForm c={c} value={value} who={who} />
        </div>
      </div>
    </>
  )
}

function CheckItem({ k }: { k: Check }) {
  return (
    <li className="flex gap-3 px-5 py-4">
      <span className="mt-0.5 shrink-0">{CHECK_ICON[k.status]}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{k.label}</span>
          <span className="text-xs uppercase tracking-wider text-muted">{k.status}</span>
        </div>
        <p className="text-sm text-muted">{k.question}</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {k.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function ResolutionCard({ c, value }: { c: IncidentCase; value: number }) {
  const r = c.resolution
  if (!r) return <Card className="p-5 text-sm text-muted">Watching — not enough evidence to decide yet.</Card>
  const a = ACTION[r.action]
  return (
    <Card className={cn('border-2 p-5', toneBorder[a.tone === 'neutral' ? 'neutral' : a.tone])}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={a.tone} dot>
          {a.label}
        </Badge>
        <span className="font-mono text-xs text-muted">{r.rule}</span>
      </div>
      {r.amount != null && <div className="mt-3 font-display text-3xl font-bold text-success-ink">{lkr(r.amount)}</div>}
      <p className="mt-2 text-[15px]">{r.summary}</p>
      <p className="mt-2 text-xs text-muted">
        {r.by === 'AUTO' ? 'Applied automatically' : 'Decided by a reviewer'} · {timeAgo(r.at)}
        {r.amount != null && ` · ${Math.round((r.amount / value) * 100)}% of order value`}
      </p>
    </Card>
  )
}

function ReviewForm({ c, value, who }: { c: IncidentCase; value: number; who?: Responsibility }) {
  const [label, setLabel] = useState<Responsibility>(who ?? 'RIDER')
  const [credit, setCredit] = useState(c.state === 'REVIEW' ? 0 : c.resolution?.amount ?? 0)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(c.state === 'REVIEW')
  if (!open)
    return (
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        Override this decision
      </Button>
    )
  return (
    <Card className={cn(c.state === 'REVIEW' && 'border-2 border-critical/50')}>
      <CardHeader title={c.state === 'REVIEW' ? 'Your decision is needed' : 'Override'} eyebrow="Your label also teaches the local model" />
      <div className="space-y-4 p-5">
        <Field label="Responsible">
          {(fid) => (
            <Select id={fid} value={label} onChange={(e) => setLabel(e.target.value as Responsibility)} className="w-full">
              {RESPONSIBILITIES.map((r) => (
                <option key={r} value={r}>
                  {RESPONSIBILITY_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Credit to the store (LKR)" hint={`Order value ${lkr(value)}. Enter 0 for no credit.`}>
          {(fid) => <input id={fid} inputMode="numeric" value={credit} onChange={(e) => setCredit(Math.min(value, Number(e.target.value.replace(/\D/g, '')) || 0))} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand focus:outline-none" />}
        </Field>
        <Field label="Note to the store">{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown with the decision" />}</Field>
        <Button
          block
          onClick={() => {
            desk((dd) => reviewCase(dd, c.id, label, credit, note.trim()))
            toast('Decision recorded', { body: credit ? `${lkr(credit)} credited · label saved for retraining` : 'No credit · label saved for retraining' })
            setOpen(false)
          }}
        >
          Record decision
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Model & rules
// ---------------------------------------------------------------------------

export function IncidentModel() {
  const d = useOps((s) => s.data)
  const m = d.desk?.model
  useEffect(() => {
    if (!m) desk((dd) => ensureDesk(dd))
  }, [m])
  if (!m) return null
  const labels = d.desk!.labels
  return (
    <>
      <Link to="/dispatcher/incidents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Incident desk
      </Link>
      <PageHeader
        eyebrow="Incident desk"
        title="Model & rules"
        subtitle="How responsibility is predicted, and what the desk is allowed to do about it."
        actions={
          <Button icon={<BrainCircuit className="size-4" />} onClick={() => (desk((dd) => retrain(dd)), toast('Model retrained on this device', { body: `${labels.length} reviewed cases included` }))}>
            Retrain on this device
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Responsibility classifier" eyebrow={`Version ${m.version} · trained ${timeAgo(m.trainedAt)}`} />
          <div className="space-y-4 p-5 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Algorithm', 'Multinomial logistic regression'],
                ['Runs', 'Locally, in this browser'],
                ['Training rows', `${m.trainRows.toLocaleString()} historical + ${m.reviewedRows} reviewed`],
                ['Held-out accuracy', `${(m.holdoutAccuracy * 100).toFixed(1)}%`],
                ['Inputs', `${FEATURES.length} case features`],
                ['Outputs', 'Rider · Operations · Merchant · External'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 p-3">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-warning-ink">
              The historical rows are labelled examples generated for this demo, so held-out accuracy is optimistic. In production, train on real resolved incidents; every reviewer decision here is added as a labelled case, weighted 6×, the next time you retrain.
            </p>
            <div>
              <div className="eyebrow mb-2">Confusion on held-out cases (rows = actual)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-center font-mono text-xs tabular-nums">
                  <thead>
                    <tr>
                      <th />
                      {RESPONSIBILITIES.map((r) => (
                        <th key={r} className="px-2 py-1 font-sans font-semibold text-muted">
                          {r[0] + r.slice(1).toLowerCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.confusion.map((row, i) => (
                      <tr key={i}>
                        <th className="px-2 py-1 text-left font-sans font-semibold text-muted">{RESPONSIBILITIES[i][0] + RESPONSIBILITIES[i].slice(1).toLowerCase()}</th>
                        {row.map((v, j) => (
                          <td key={j} className={cn('px-2 py-1.5', i === j ? 'bg-brand-soft font-bold text-brand-ink' : v ? 'text-attention-ink' : 'text-faint')}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="eyebrow mb-2">Strongest signals per outcome</div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {RESPONSIBILITIES.map((r, k) => (
                  <li key={r} className="rounded-lg border border-line p-3">
                    <div className="font-semibold">{RESPONSIBILITY_LABEL[r].split(' (')[0]}</div>
                    <ul className="mt-1 text-xs text-muted">
                      {m.weights[k]
                        .slice(0, FEATURES.length)
                        .map((w, j) => ({ w, j }))
                        .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
                        .slice(0, 3)
                        .map(({ w, j }) => (
                          <li key={j}>
                            {w > 0 ? '↑' : '↓'} {FEATURES[j].label}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Resolution rules" eyebrow="Evaluated in order; the first match wins" />
            <ul className="divide-y divide-line">
              {RULES.map((r) => (
                <li key={r.id} className="grid grid-cols-[44px_1fr] gap-3 px-5 py-3.5 text-sm">
                  <span className="font-mono font-bold text-brand-ink">{r.id}</span>
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-muted">
                      <b className="text-ink">When</b> {r.when}. <b className="text-ink">Then</b> {r.then}.
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="The five checks" eyebrow="Assembled for every case" />
            <ul className="divide-y divide-line text-sm">
              {[
                ['Promise', 'Was the window (and Fresh 08:00) kept, or projected to be kept?'],
                ['GPS trail', 'Did the rider enter the 150 m store geofence? Any long stops or detours?'],
                ['Proof of delivery', 'Signature/photo captured, and captured at the store?'],
                ['Handover', 'Was it loaded complete? Was the store open to receive?'],
                ['Claim integrity', 'Does a claim match the evidence and the store’s credit history?'],
              ].map(([k, v]) => (
                <li key={k} className="px-5 py-3">
                  <span className="font-semibold">{k}</span> <span className="text-muted">— {v}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 text-sm">
            <div className="font-semibold">Reviewed cases ({labels.length})</div>
            <p className="mt-1 text-muted">
              {labels.length === 0
                ? 'Decisions you record on a case appear here and feed the next retrain.'
                : labels.length > m.reviewedRows
                  ? `${labels.length - m.reviewedRows} new reviewer ${labels.length - m.reviewedRows === 1 ? 'label is' : 'labels are'} waiting. Retrain to include ${labels.length - m.reviewedRows === 1 ? 'it' : 'them'}.`
                  : `All ${labels.length} reviewer ${labels.length === 1 ? 'label is' : 'labels are'} included in model v${m.version}.`}
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
