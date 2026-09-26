import { outletGeo } from '../geo'
import { byId, FRESH_DEADLINE } from '../rules'
import { fmtMin, hm } from '../time'
import type { District, Minutes, Order, Trip } from '../types'
import { commands, log, notify, uid, type OpsData } from '../../store/events'
import { predict, train } from './classifier'
import { assignScenarios, GEOFENCE_KM, km, lkr, offPlanKm, orderValue, simulateTrip, unitPrice, type SimTrip } from './sim'
import type { Check, Credit, DeskState, IncidentCase, Resolution, Responsibility, Scenario, SignalKind } from './types'
import { SIGNAL_LABEL } from './types'

/** The vehicle the demo driver controls by hand; the watcher never drives it. */
export const HAND_DRIVEN = 'VEH014'
const DAY = 86_400_000

// ---------------------------------------------------------------------------
// Desk state & clock
// ---------------------------------------------------------------------------

function seedCredits(d: OpsData): Credit[] {
  const out: Credit[] = []
  const now = Date.now()
  d.outlets.forEach((o, i) => {
    const n = (i * 7) % 11 === 0 ? 2 : (i * 3) % 7 === 0 ? 1 : 0
    for (let k = 0; k < n; k++) out.push({ id: `CR-H${i}-${k}`, outletId: o.id, amount: 3500 + ((i * 1300 + k * 900) % 9000), reason: k ? 'Late delivery credit' : 'Damaged goods credit', at: now - (12 + ((i * 17 + k * 23) % 70)) * DAY, auto: false })
  })
  return out
}

export function ensureDesk(d: OpsData): DeskState {
  if (!d.desk) {
    d.desk = {
      live: { running: false, anchor: 0, base: hm(3, 45), speed: 2, startedAt: null },
      scenarios: {},
      cases: [],
      notices: [],
      credits: seedCredits(d),
      labels: [],
      feed: [],
      lastScan: 0,
    }
  }
  if (!d.desk.model) d.desk.model = train(d.desk.labels, 1)
  return d.desk
}

/** Operations clock (minutes since midnight) for the live watch. */
export function simNow(desk: DeskState | undefined, now = Date.now()): Minutes | null {
  if (!desk?.live.startedAt) return null
  return desk.live.running ? desk.live.base + ((now - desk.live.anchor) / 1000) * desk.live.speed : desk.live.base
}

function feed(desk: DeskState, sim: Minutes, text: string, tone: DeskState['feed'][number]['tone'] = 'info') {
  desk.feed.unshift({ at: Date.now(), sim, text, tone })
  if (desk.feed.length > 80) desk.feed.length = 80
}

/** Start the delivery day: publish the plan if needed and send the fleet out under watch. */
export function startLiveDay(d: OpsData, now = Date.now()) {
  const desk = ensureDesk(d)
  if (!d.ordersClosed) commands.closeOrders(d)
  if (d.plan === 'NONE') commands.generatePlan(d)
  if (d.plan === 'DRAFT') commands.publishPlan(d)
  const trips = d.trips.filter((t) => t.number === 1 && t.stops.length && (['PLANNED', 'LOADING', 'LOADED'].includes(t.status) ? t.vehicleId !== HAND_DRIVEN : t.status === 'IN_PROGRESS'))
  for (const t of trips) {
    if (t.status === 'IN_PROGRESS') continue
    t.status = 'IN_PROGRESS'
    t.startedAt = now
    for (const id of t.stops) {
      const o = byId(d.orders, id)!
      if (['PLANNED', 'LOADED'].includes(o.status)) o.status = 'IN_TRANSIT'
    }
    log(d, t.vehicleId, 'SYSTEM', `${t.id} departed under live watch`)
  }
  const { scenarios, congested } = assignScenarios(trips, HAND_DRIVEN)
  desk.scenarios = scenarios
  desk.congestedDistrict = congested
  desk.live = { running: true, anchor: now, base: hm(3, 45), speed: desk.live.speed || 2, startedAt: now }

  // The "short" trip's first order was loaded short; the "claim" store has a history of credits.
  for (const [tripId, sc] of Object.entries(scenarios)) {
    const t = byId(d.trips, tripId)!
    const first = byId(d.orders, t.stops[0])!
    if (sc === 'SHORT' && !first.shortfall) {
      first.shortfall = { item: first.items[0].name, missing: Math.min(3, first.items[0].qty), reason: 'Inventory unavailable' }
      log(d, first.id, 'LOADER', `Loaded short: ${first.shortfall.missing} × ${first.shortfall.item}`)
    }
    if (sc === 'CLAIM') {
      for (let k = 0; k < 4; k++) desk.credits.push({ id: uid('CR'), outletId: first.outletId, amount: 6000 + k * 1500, reason: 'Missing goods credit', at: now - (8 + k * 14) * DAY, auto: false })
    }
  }
  feed(desk, desk.live.base, `Live watch started · ${trips.length} vehicles on the road${congested ? ` · watching ${congested}` : ''}`, 'success')
}

export function setSpeed(d: OpsData, speed: number, now = Date.now()) {
  const desk = ensureDesk(d)
  const t = simNow(desk, now) ?? desk.live.base
  desk.live = { ...desk.live, base: t, anchor: now, speed, running: speed > 0 }
}

// ---------------------------------------------------------------------------
// Case assembly: evidence, five checks, features
// ---------------------------------------------------------------------------

export interface CaseFile {
  order: Order
  trip: Trip
  sim?: SimTrip
  stop?: SimTrip['stops'][number]
  deadline: Minutes
  projectedDone: Minutes | null
  finished: boolean
  lateMin: number
  geofenceAt: Minutes | null
  proofDistanceM: number | null
  maxOffKm: number
  stationaryMin: number
  credits90: Credit[]
  networkAvgCredits: number
  zoneShare: number
  timeline: { t: Minutes | null; at?: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]
}

const DONE = ['DELIVERED', 'PARTIAL', 'FAILED', 'RECEIVED']

export function deadlineOf(d: OpsData, o: Order): Minutes {
  const out = byId(d.outlets, o.outletId)!
  return o.brand === 'Fresh' ? Math.min(out.window[1], FRESH_DEADLINE) : out.window[1]
}

export function buildCaseFile(d: OpsData, c: Pick<IncidentCase, 'orderId' | 'tripId' | 'district'>, t: Minutes): CaseFile {
  const desk = ensureDesk(d)
  const order = byId(d.orders, c.orderId)!
  const trip = byId(d.trips, c.tripId)!
  const scenario = desk.scenarios[trip.id] as Scenario | undefined
  const sim = scenario ? simulateTrip(d, trip, scenario) : undefined
  const stop = sim?.stops.find((s) => s.orderId === order.id)
  const outlet = byId(d.outlets, order.outletId)!
  const here = outletGeo(outlet)
  const deadline = deadlineOf(d, order)
  const finished = DONE.includes(order.status)
  const trail = sim ? sim.trail.filter((p) => p.t <= t) : []

  const geofenceAt = trail.find((p) => km([p.lat, p.lng], here) <= GEOFENCE_KM)?.t ?? null
  let maxOffKm = 0
  for (const p of trail) maxOffKm = Math.max(maxOffKm, sim ? offPlanKm(sim, [p.lat, p.lng]) : 0)
  // Stationary = moved less than 150 m in 10 minutes (crawling traffic still moves), away from any delivery point.
  let stationaryMin = 0
  let run = 0
  for (let i = 1; i < trail.length; i++) {
    const pt: [number, number] = [trail[i].lat, trail[i].lng]
    let j = i
    while (j > 0 && trail[j].t > trail[i].t - 10) j--
    const still = trail[i].t - trail[j].t >= 9 && km(pt, [trail[j].lat, trail[j].lng]) < 0.15
    const atStop = sim?.stops.some((s) => km(pt, s.deliveredAt) < 0.1)
    run = still && !atStop ? run + (trail[i].t - trail[i - 1].t) : 0
    stationaryMin = Math.max(stationaryMin, run)
  }
  // Live ETA: known within a 60-minute horizon of the planned drop, like a telematics ETA feed.
  const projectedDone = stop && (finished || t >= stop.plannedDone - 60 || t >= stop.arrive) ? stop.done : null
  const lateMin = projectedDone != null ? Math.max(0, Math.round(projectedDone - deadline)) : 0
  const proofDistanceM = finished && stop ? Math.round(km(stop.deliveredAt, here) * 1000) : null

  // History before this incident (a credit issued for this order doesn't count against the store).
  const credits90 = desk.credits.filter((cr) => cr.outletId === outlet.id && cr.orderId !== order.id && Date.now() - cr.at < 90 * DAY)
  const perOutlet = new Map<string, number>()
  for (const cr of desk.credits) if (Date.now() - cr.at < 90 * DAY) perOutlet.set(cr.outletId, (perOutlet.get(cr.outletId) ?? 0) + 1)
  const networkAvgCredits = [...perOutlet.values()].reduce((a, b) => a + b, 0) / d.outlets.length

  // How much of this district is running late for reasons the vehicles themselves don't explain:
  // share of live vehicles in the district that are late without their own anomaly (stuck, off route, off-site).
  let vehicles = 0
  let lateVehicles = 0
  for (const [tid, sc] of Object.entries(desk.scenarios)) {
    const tr = byId(d.trips, tid)
    if (!tr || tr.district !== c.district) continue
    vehicles++
    const own = desk.cases.some((x) => x.tripId === tid && x.signals.some((sg) => sg.kind === 'STATIONARY' || sg.kind === 'OFF_ROUTE' || sg.kind === 'GHOST_DELIVERY'))
    const late = simulateTrip(d, tr, sc as Scenario).stops.some((s) => {
      const o = byId(d.orders, s.orderId)
      return !!o && s.done > t && t >= s.plannedDone - 120 && s.done > deadlineOf(d, o) + 5
    })
    if (late && !own) lateVehicles++
  }
  const zoneShare = vehicles >= 3 ? lateVehicles / vehicles : 0

  const audit = d.audit.filter((a) => a.entity === order.id).sort((a, b) => a.at - b.at)
  const timeline: CaseFile['timeline'] = [
    ...audit.slice(0, 3).map((a) => ({ t: null, at: a.at, text: a.text })),
    { t: trip.departure, text: `${trip.vehicleId} departed ${fmtMin(trip.departure)} (${trip.id})` },
    ...(stop ? [{ t: stop.plannedDone, text: `Planned drop-off ${fmtMin(stop.plannedDone)} · promise by ${fmtMin(deadline)}` }] : []),
    ...(geofenceAt != null ? [{ t: geofenceAt, text: `Entered store geofence ${fmtMin(geofenceAt)}`, tone: 'ok' as const }] : []),
    ...(finished && stop ? [{ t: stop.done, text: `${stop.outcome === 'CLOSED' ? 'Failed attempt · store closed' : stop.outcome === 'PARTIAL' ? 'Delivered short' : 'Marked delivered'} ${fmtMin(stop.done)}`, tone: (stop.outcome === 'DELIVERED' && stop.inGeofence && stop.done <= deadline ? 'ok' : 'bad') as 'ok' | 'bad' }] : []),
  ]
  return { order, trip, sim, stop, deadline, projectedDone, finished, lateMin, geofenceAt, proofDistanceM, maxOffKm, stationaryMin, credits90, networkAvgCredits, zoneShare, timeline }
}

export function runChecks(d: OpsData, cf: CaseFile, claim: boolean): Check[] {
  const o = cf.order
  const outlet = byId(d.outlets, o.outletId)!
  const closed = cf.stop?.outcome === 'CLOSED' && cf.finished
  const shortUnits = o.shortfall?.missing ?? 0
  const contradicts = claim && cf.stop?.inGeofence === true && (cf.proofDistanceM ?? 999) <= 150 && shortUnits === 0
  return [
    {
      id: 'promise',
      label: 'Promise',
      question: 'Was the delivery promise kept?',
      status: cf.projectedDone == null ? 'pending' : cf.lateMin <= 0 ? 'pass' : cf.finished ? 'fail' : 'warn',
      evidence: [
        `Window ${fmtMin(outlet.window[0])}–${fmtMin(outlet.window[1])}${o.brand === 'Fresh' ? ' · Fresh must arrive by 08:00' : ''}`,
        cf.projectedDone == null ? 'Too early to project the drop-off' : `${cf.finished ? 'Completed' : 'Projected'} ${fmtMin(cf.projectedDone)} · ${cf.lateMin > 0 ? `${cf.lateMin} min late` : 'on time'}`,
      ],
    },
    {
      id: 'gps',
      label: 'GPS trail',
      question: 'Does the rider’s GPS trail support what was recorded?',
      status: !cf.sim ? 'pending' : cf.finished && !cf.stop?.inGeofence ? 'fail' : cf.maxOffKm > 0.8 ? 'fail' : cf.stationaryMin >= 10 ? 'warn' : cf.geofenceAt == null && !cf.finished ? 'pending' : 'pass',
      evidence: [
        cf.geofenceAt != null ? `Entered the ${GEOFENCE_KM * 1000} m store geofence at ${fmtMin(cf.geofenceAt)}` : cf.finished ? `Never entered the ${GEOFENCE_KM * 1000} m store geofence` : 'Not at the store yet',
        `Furthest from planned route: ${cf.maxOffKm.toFixed(1)} km`,
        `Longest stop away from a store: ${Math.round(cf.stationaryMin)} min`,
      ],
    },
    {
      id: 'proof',
      label: 'Proof of delivery',
      question: 'Is there proof, captured at the right place?',
      status: !cf.finished ? 'pending' : closed ? 'pass' : (cf.proofDistanceM ?? 0) > 150 ? 'fail' : 'pass',
      evidence: !cf.finished
        ? ['Awaiting delivery']
        : closed
          ? ['Photo of closed store captured on arrival', `Driver waited ${cf.stop?.dwell ?? 0} min inside the geofence`]
          : [`Signature and receiver name captured`, `Captured ${cf.proofDistanceM} m from the store${(cf.proofDistanceM ?? 0) > 150 ? ' — outside the geofence' : ''}`],
    },
    {
      id: 'handover',
      label: 'Handover',
      question: 'Did the depot and the store do their part?',
      status: shortUnits > 0 || closed ? 'fail' : 'pass',
      evidence: [shortUnits ? `Loaded short: ${shortUnits} × ${o.shortfall!.item} (${o.shortfall!.reason})` : 'Loaded complete and counted by the loader', closed ? 'Store closed / receiving team absent on arrival' : 'Store open to receive'],
    },
    {
      id: 'integrity',
      label: 'Claim integrity',
      question: 'Is any claim consistent with evidence and history?',
      status: contradicts && cf.credits90.length >= 3 ? 'fail' : cf.credits90.length >= 3 ? 'warn' : 'pass',
      evidence: [
        `${cf.credits90.length} credits in the last 90 days (${lkr(cf.credits90.reduce((s, c) => s + c.amount, 0))}) · network average ${cf.networkAvgCredits.toFixed(1)}`,
        claim ? (contradicts ? 'Claim says goods missing, but loading, geofence and proof all agree it was delivered in full' : 'Claim is consistent with the evidence') : 'No claim filed by the store',
      ],
    },
  ]
}

export function featuresOf(cf: CaseFile, claim: boolean): number[] {
  const shortUnits = cf.order.shortfall?.missing ?? 0
  const closed = cf.stop?.outcome === 'CLOSED' && cf.finished ? 1 : 0
  const contradicts = claim && cf.stop?.inGeofence && (cf.proofDistanceM ?? 999) <= 150 && shortUnits === 0 ? 1 : 0
  return [
    Math.min(2, cf.lateMin / 60),
    cf.finished ? (cf.stop?.inGeofence ? 1 : 0) : 1,
    Math.min(1.5, (cf.stop?.dwell ?? 10) / 30),
    Math.min(2, cf.maxOffKm / 3),
    Math.min(2, cf.stationaryMin / 30),
    1,
    cf.finished ? ((cf.proofDistanceM ?? 0) <= 150 ? 1 : 0) : 1,
    Math.min(2, shortUnits / 5),
    closed,
    cf.zoneShare,
    Math.min(2, cf.credits90.length / 5),
    contradicts,
  ]
}

// ---------------------------------------------------------------------------
// Resolution rules
// ---------------------------------------------------------------------------

export const RULES = [
  { id: 'R1', name: 'Integrity guard', when: 'Claim-integrity check fails', then: 'Send to human review; no automatic credit' },
  { id: 'R2', name: 'Confidence floor', when: 'Model confidence below 60%', then: 'Send to human review' },
  { id: 'R3', name: 'Zone-wide delay', when: 'External cause and 3+ late deliveries in one district', then: 'One delay notice to every store in the zone; no individual credits' },
  { id: 'R4', name: 'Our fault, real impact', when: 'Rider or operations responsible and late ≥ 20 min, short, or delivered off-site', then: 'Instant credit: 10–20% for lateness, unit value for shortages, full value for off-site deliveries' },
  { id: 'R5', name: 'Store not ready', when: 'Merchant responsible and store closed', then: 'Re-attempt on the next run; no credit; evidence shared' },
  { id: 'R6', name: 'Early warning', when: 'Delivery still in progress and projected late', then: 'Proactive delay notice to the store' },
] as const

function decide(d: OpsData, c: IncidentCase, cf: CaseFile): Resolution | null {
  const p = c.prediction!
  const integrity = c.checks.find((x) => x.id === 'integrity')!
  const now = Date.now()
  const notice = d.desk!.notices.find((n) => n.district === c.district && n.orderIds.includes(c.orderId))
  if (!cf.finished) {
    if (p.top === 'EXTERNAL' && notice) return { rule: 'R3 · Zone-wide delay', action: 'ZONE_NOTICE', summary: `Covered by the ${c.district} delay notice (+${notice.delayMin} min).`, at: now, by: 'AUTO' }
    if (cf.lateMin > 0) return { rule: 'R6 · Early warning', action: 'PROACTIVE_NOTICE', summary: `Store told before the window closed: about ${cf.lateMin} min late.`, at: now, by: 'AUTO' }
    return null
  }
  if (integrity.status === 'fail') return { rule: 'R1 · Integrity guard', action: 'HUMAN_REVIEW', summary: 'Claim contradicts loading, GPS and proof, and the store has a high credit history. Held for review.', at: now, by: 'AUTO' }
  if (p.confidence < 0.6) return { rule: 'R2 · Confidence floor', action: 'HUMAN_REVIEW', summary: `Model is only ${Math.round(p.confidence * 100)}% sure. Held for review.`, at: now, by: 'AUTO' }
  if (p.top === 'EXTERNAL' && notice) return { rule: 'R3 · Zone-wide delay', action: 'ZONE_NOTICE', summary: `Covered by the ${c.district} delay notice (+${notice.delayMin} min).`, at: now, by: 'AUTO' }
  const value = orderValue(cf.order)
  if (p.top === 'RIDER' || p.top === 'OPERATIONS') {
    if (cf.stop && !cf.stop.inGeofence) return { rule: 'R4 · Our fault, real impact', action: 'INSTANT_REFUND', amount: value, summary: 'Marked delivered away from the store. Full credit and a redelivery on the next run.', at: now, by: 'AUTO' }
    const short = cf.order.shortfall?.missing ?? 0
    if (short > 0) return { rule: 'R4 · Our fault, real impact', action: 'INSTANT_REFUND', amount: short * unitPrice(cf.order.shortfall!.item), summary: `Credit for ${short} × ${cf.order.shortfall!.item} not delivered.`, at: now, by: 'AUTO' }
    if (cf.lateMin >= 20) {
      const pct = cf.lateMin >= 45 || (cf.order.brand === 'Fresh' && (cf.projectedDone ?? 0) > FRESH_DEADLINE) ? 0.2 : 0.1
      return { rule: 'R4 · Our fault, real impact', action: 'INSTANT_REFUND', amount: Math.round(value * pct), summary: `${cf.lateMin} min late. ${pct * 100}% delivery credit applied automatically.`, at: now, by: 'AUTO' }
    }
  }
  if (p.top === 'MERCHANT' && cf.stop?.outcome === 'CLOSED') return { rule: 'R5 · Store not ready', action: 'REATTEMPT', summary: 'Store was closed; driver waited inside the geofence. Re-attempt on the next run, no credit.', at: now, by: 'AUTO' }
  return { rule: '—', action: 'NO_ACTION', summary: 'Delivered within tolerance. Case closed with no action.', at: now, by: 'AUTO' }
}

function apply(d: OpsData, c: IncidentCase, r: Resolution, t: Minutes) {
  const desk = d.desk!
  const o = byId(d.orders, c.orderId)!
  const out = byId(d.outlets, o.outletId)!
  const prev = c.resolution?.action
  c.resolution = r
  c.state = r.action === 'HUMAN_REVIEW' ? 'REVIEW' : r.action === 'PROACTIVE_NOTICE' ? 'WATCHING' : 'RESOLVED'
  if (prev === r.action && r.action !== 'INSTANT_REFUND') return
  log(d, o.id, 'SYSTEM', `Incident ${c.id}: ${r.rule} → ${r.summary}`)
  switch (r.action) {
    case 'INSTANT_REFUND':
      if (desk.credits.some((cr) => cr.caseId === c.id)) return
      desk.credits.push({ id: uid('CR'), outletId: out.id, orderId: o.id, amount: r.amount!, reason: r.summary, at: Date.now(), caseId: c.id, auto: r.by === 'AUTO' })
      notify(d, { to: ['STORE_MANAGER'], outletId: out.id, severity: 'INFO', title: `Credit of ${lkr(r.amount!)} applied`, body: `${o.id}: ${r.summary}`, link: `/store/orders/${o.id}` })
      notify(d, { to: ['DISPATCHER'], severity: 'INFO', title: 'Instant credit issued', body: `${out.id} · ${lkr(r.amount!)} · ${c.prediction?.top.toLowerCase()} responsible`, link: `/dispatcher/incidents/${c.id}` })
      feed(desk, t, `${out.id} · instant credit ${lkr(r.amount!)} (${r.rule.split(' ·')[0]})`, 'success')
      break
    case 'PROACTIVE_NOTICE':
      notify(d, { to: ['STORE_MANAGER'], outletId: out.id, severity: 'WARNING', title: 'Your delivery is running late', body: `${o.id}: we now expect it about ${r.summary.match(/(\d+) min late/)?.[1] ?? 'a few'} min after your window. No need to call — we'll keep you posted.`, link: `/store/orders/${o.id}` })
      feed(desk, t, `${out.id} · early delay notice sent before the window closed`, 'warning')
      break
    case 'REATTEMPT':
      notify(d, { to: ['STORE_MANAGER'], outletId: out.id, severity: 'WARNING', title: 'We missed you — re-delivery booked', body: `${o.id}: the store was closed at ${fmtMin(t)}. We'll deliver on the next run.`, link: `/store/orders/${o.id}` })
      feed(desk, t, `${out.id} · store closed, re-attempt booked (no credit)`, 'info')
      break
    case 'HUMAN_REVIEW':
      notify(d, { to: ['DISPATCHER'], severity: 'WARNING', title: 'Incident needs review', body: `${out.id} · ${r.summary}`, link: `/dispatcher/incidents/${c.id}` })
      feed(desk, t, `${out.id} · held for review (${r.rule.split(' ·')[0]})`, 'critical')
      break
    case 'ZONE_NOTICE':
      break
    case 'NO_ACTION':
      feed(desk, t, `${out.id} · closed, within tolerance`, 'info')
      break
  }
}

export function evaluate(d: OpsData, c: IncidentCase, t: Minutes) {
  const desk = d.desk!
  const claim = c.signals.some((s) => s.kind === 'STORE_CLAIM')
  const cf = buildCaseFile(d, c, t)
  c.checks = runChecks(d, cf, claim)
  c.features = featuresOf(cf, claim)
  if (c.review) return
  c.prediction = predict(desk.model!, c.features)
  const r = decide(d, c, cf)
  if (r) apply(d, c, r, t)
}

// ---------------------------------------------------------------------------
// The watcher
// ---------------------------------------------------------------------------

const SEVERITY: Record<SignalKind, IncidentCase['severity']> = {
  LATE_RISK: 'WARNING',
  STATIONARY: 'WARNING',
  OFF_ROUTE: 'HIGH',
  GHOST_DELIVERY: 'CRITICAL',
  FAILED_ATTEMPT: 'WARNING',
  SHORT_DELIVERY: 'HIGH',
  STORE_CLAIM: 'HIGH',
}
const RANK = { INFO: 0, WARNING: 1, HIGH: 2, CRITICAL: 3 }

function signal(d: OpsData, trip: Trip, orderId: string, kind: SignalKind, t: Minutes, detail: string) {
  const desk = d.desk!
  let c = desk.cases.find((x) => x.orderId === orderId)
  if (c?.signals.some((s) => s.kind === kind)) return c
  const o = byId(d.orders, orderId)!
  if (!c) {
    const out = byId(d.outlets, o.outletId)!
    c = {
      id: `INC-${String(desk.cases.length + 1).padStart(3, '0')}`,
      orderId,
      outletId: out.id,
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      district: out.district,
      severity: SEVERITY[kind],
      state: 'WATCHING',
      signals: [],
      openedAt: Date.now(),
      openedSim: t,
      leadMin: kind === 'LATE_RISK' || kind === 'STATIONARY' || kind === 'OFF_ROUTE' ? Math.round(deadlineOf(d, o) - t) : null,
      complaintBeforeDetection: kind === 'STORE_CLAIM',
      features: [],
      checks: [],
    }
    desk.cases.unshift(c)
    feed(desk, t, `${out.id} · ${SIGNAL_LABEL[kind]} — ${detail}`, kind === 'GHOST_DELIVERY' ? 'critical' : 'warning')
  } else if (RANK[SEVERITY[kind]] > RANK[c.severity]) c.severity = SEVERITY[kind]
  c.signals.push({ kind, at: Date.now(), sim: t, detail })
  return c
}

/** One watcher pass: advance simulated vehicles, detect problems, build and resolve cases. */
export function tick(d: OpsData, now = Date.now()) {
  const desk = ensureDesk(d)
  const t = simNow(desk, now)
  if (t == null) return
  desk.lastScan = now
  const touched = new Set<IncidentCase>()

  for (const [tripId, scenario] of Object.entries(desk.scenarios)) {
    const trip = byId(d.trips, tripId)
    if (!trip || trip.status === 'ABORTED' || trip.status === 'PAUSED') continue
    const sim = simulateTrip(d, trip, scenario as Scenario)
    const trail = sim.trail.filter((p) => p.t <= t)
    const here = trail[trail.length - 1]

    for (const st of sim.stops) {
      const o = byId(d.orders, st.orderId)
      if (!o || o.tripId !== trip.id) continue
      const out = byId(d.outlets, o.outletId)!
      const deadline = deadlineOf(d, o)

      // Advance order state from the road.
      if (t >= st.arrive && o.status === 'IN_TRANSIT') o.status = 'ARRIVED'
      if (t >= st.done && !DONE.includes(o.status)) {
        o.status = st.outcome === 'CLOSED' ? 'FAILED' : st.outcome === 'PARTIAL' ? 'PARTIAL' : 'DELIVERED'
        o.delivery = { outcome: st.outcome === 'CLOSED' ? 'CLOSED' : st.outcome, receiver: st.outcome === 'CLOSED' ? undefined : out.manager, signature: st.outcome === 'CLOSED' ? undefined : 'captured', arrivedAt: now, completedAt: now, notes: st.outcome === 'CLOSED' ? 'Store closed on arrival' : undefined }
        log(d, o.id, 'DRIVER', `${o.status === 'FAILED' ? 'Failed attempt (store closed)' : o.status === 'PARTIAL' ? 'Delivered short' : 'Delivered'} at ${fmtMin(st.done)} (ops clock)`)
        if (st.outcome === 'DELIVERED' || st.outcome === 'PARTIAL') notify(d, { to: ['STORE_MANAGER'], outletId: out.id, severity: 'INFO', title: 'Delivered — please confirm receipt', body: `${o.id} ${o.status === 'PARTIAL' ? 'delivered short' : 'delivered'}`, link: '/store' })
        if (!st.inGeofence) touched.add(signal(d, trip, o.id, 'GHOST_DELIVERY', t, `marked delivered ${Math.round(km(st.deliveredAt, outletGeo(out)) * 1000)} m from the store`))
        if (st.outcome === 'CLOSED') touched.add(signal(d, trip, o.id, 'FAILED_ATTEMPT', t, 'store closed; driver waited 15 min in the geofence'))
        if (st.outcome === 'PARTIAL') touched.add(signal(d, trip, o.id, 'SHORT_DELIVERY', t, `${o.shortfall?.missing ?? 0} units short from loading`))
      }
      // Early warning: projected past the promise while there is still time to act.
      if (!DONE.includes(o.status) && t >= st.plannedDone - 60 && st.done > deadline + 5 && t < deadline) {
        touched.add(signal(d, trip, o.id, 'LATE_RISK', t, `projected ${fmtMin(st.done)} vs promise ${fmtMin(deadline)}`))
      }
      // A store claim arrives after delivery (the only case a customer raises first).
      if (scenario === 'CLAIM' && st === sim.stops[0] && t >= st.done + 20 && DONE.includes(o.status)) {
        touched.add(signal(d, trip, o.id, 'STORE_CLAIM', t, 'store reports goods missing'))
      }
    }

    // Vehicle-level anomalies are pinned to the next undelivered stop.
    const next = sim.stops.find((s) => !DONE.includes(byId(d.orders, s.orderId)?.status ?? ''))
    if (here && next) {
      const recent = trail.slice(-12)
      const still = recent.length >= 12 && recent.every((p) => km([p.lat, p.lng], [here.lat, here.lng]) < 0.08)
      const atStore = sim.stops.some((s) => km([here.lat, here.lng], outletGeo(byId(d.outlets, s.outletId)!)) <= GEOFENCE_KM + 0.05)
      if (still && !atStore) touched.add(signal(d, trip, next.orderId, 'STATIONARY', t, `${trip.vehicleId} hasn't moved for 12 min away from any stop`))
      const off = offPlanKm(sim, [here.lat, here.lng])
      if (off > 0.8) touched.add(signal(d, trip, next.orderId, 'OFF_ROUTE', t, `${trip.vehicleId} is ${off.toFixed(1)} km off the planned route`))
    }
    if (trip.status === 'IN_PROGRESS' && sim.stops.every((s) => DONE.includes(byId(d.orders, s.orderId)?.status ?? '')) && t >= sim.trail[sim.trail.length - 1].t) {
      trip.status = 'COMPLETED'
      log(d, trip.vehicleId, 'SYSTEM', `${trip.id} completed (ops clock ${fmtMin(t)})`)
    }
  }

  // Re-evaluate open cases each pass (evidence grows as the day moves).
  for (const c of desk.cases) if (c.state !== 'RESOLVED' || touched.has(c)) evaluate(d, c, t)
  zoneRule(d, t)
}

/** R3: several deliveries late in one district for an external reason → one notice for the whole zone. */
function zoneRule(d: OpsData, t: Minutes) {
  const desk = d.desk!
  const byDistrict = new Map<District, IncidentCase[]>()
  for (const c of desk.cases) {
    if (c.prediction?.top !== 'EXTERNAL' || !c.signals.some((s) => s.kind === 'LATE_RISK' || s.kind === 'STATIONARY')) continue
    byDistrict.set(c.district, [...(byDistrict.get(c.district) ?? []), c])
  }
  for (const [district, cases] of byDistrict) {
    if (cases.length < 3 || new Set(cases.map((c) => c.vehicleId)).size < 2) continue
    let notice = desk.notices.find((n) => n.district === district)
    const pending = d.orders.filter((o) => o.tripId && desk.scenarios[o.tripId] && byId(d.outlets, o.outletId)?.district === district && !DONE.includes(o.status))
    if (!notice) {
      const delays = cases.map((c) => Number(c.checks.find((x) => x.id === 'promise')?.evidence[1].match(/(\d+) min late/)?.[1] ?? 0)).filter(Boolean)
      const delayMin = delays.length ? Math.round(delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] / 5) * 5 || 15 : 20
      notice = { id: uid('ZN'), district, at: Date.now(), sim: t, delayMin, cause: 'Flooding and heavy congestion across the district', orderIds: [], outletIds: [] }
      desk.notices.unshift(notice)
      feed(desk, t, `Zone-wide delay notice · ${district} · +${delayMin} min to ${pending.length} stores`, 'warning')
      log(d, `ZONE-${district}`, 'SYSTEM', `Zone-wide delay notice issued (+${delayMin} min)`)
      notify(d, { to: ['DISPATCHER'], severity: 'WARNING', title: `Zone-wide delay · ${district}`, body: `${pending.length} stores told to expect about +${delayMin} min`, link: '/dispatcher/incidents' })
    }
    for (const o of pending) {
      if (notice.orderIds.includes(o.id)) continue
      notice.orderIds.push(o.id)
      if (!notice.outletIds.includes(o.outletId)) {
        notice.outletIds.push(o.outletId)
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'WARNING', title: `Deliveries in ${district} are running late`, body: `${notice.cause}. Expect your delivery about ${notice.delayMin} min later than planned. No action needed.`, link: '/store' })
      }
    }
    for (const c of cases) {
      if (!notice.orderIds.includes(c.orderId)) notice.orderIds.push(c.orderId)
      c.noticeId = notice.id
      if (!c.review) apply(d, c, { rule: 'R3 · Zone-wide delay', action: 'ZONE_NOTICE', summary: `Covered by the ${district} delay notice (+${notice.delayMin} min). No individual credit for an external cause.`, at: Date.now(), by: 'AUTO' }, t)
    }
  }
}

// ---------------------------------------------------------------------------
// Human review & retraining
// ---------------------------------------------------------------------------

export function reviewCase(d: OpsData, caseId: string, label: Responsibility, credit: number, note: string) {
  const desk = ensureDesk(d)
  const c = desk.cases.find((x) => x.id === caseId)
  if (!c) return
  c.review = { label, note, at: Date.now() }
  desk.labels.push({ features: c.features, label, at: Date.now() })
  const t = simNow(desk) ?? 0
  const r: Resolution =
    credit > 0
      ? { rule: 'Reviewer decision', action: 'INSTANT_REFUND', amount: credit, summary: note || `Reviewer assigned responsibility to ${label.toLowerCase()} and approved a credit.`, at: Date.now(), by: 'REVIEWER' }
      : { rule: 'Reviewer decision', action: 'NO_ACTION', summary: note || `Reviewer assigned responsibility to ${label.toLowerCase()}; no credit.`, at: Date.now(), by: 'REVIEWER' }
  apply(d, c, r, t)
  c.state = 'RESOLVED'
  if (credit === 0) {
    const o = byId(d.orders, c.orderId)!
    notify(d, { to: ['STORE_MANAGER'], outletId: c.outletId, severity: 'INFO', title: 'Claim reviewed', body: `${o.id}: our records show the order delivered in full at the store (GPS and signature). Contact your account manager to discuss.`, link: `/store/orders/${o.id}` })
  }
}

export function retrain(d: OpsData) {
  const desk = ensureDesk(d)
  desk.model = train(desk.labels, (desk.model?.version ?? 0) + 1)
  const t = simNow(desk) ?? desk.live.base
  feed(desk, t, `Model v${desk.model.version} retrained on this device · ${desk.labels.length} reviewed cases added`, 'success')
  for (const c of desk.cases) if (!c.review) c.prediction = predict(desk.model, c.features)
}

export function resetDesk(d: OpsData) {
  delete d.desk
  ensureDesk(d)
}
