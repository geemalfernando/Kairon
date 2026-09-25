import { byId, customerMessageFor, generatePlan, nextRecommendation, recoveryPlan, sequence, validate } from '../domain/rules'
import { buildOrders, buildOutlets, buildVehicles, measure, priorityOf, tempOf } from '../domain/seed'
import { fmtClock, isoDay } from '../domain/time'
import type { AuditEvent, DeliveryRecord, Issue, IssueKind, Notification, Order, OrderItem, Outlet, Receipt, Role, Severity, Trip, Vehicle } from '../domain/types'

/** The single operational state every role looks at. */
export interface OpsData {
  orders: Order[]
  outlets: Outlet[]
  vehicles: Vehicle[]
  trips: Trip[]
  issues: Issue[]
  notifications: Notification[]
  audit: AuditEvent[]
  ordersClosed: boolean
  plan: 'NONE' | 'DRAFT' | 'PUBLISHED'
  deliveryDate: string
}

export function seedOps(): OpsData {
  const outlets = buildOutlets()
  const orders = buildOrders(outlets)
  return {
    outlets,
    vehicles: buildVehicles(),
    orders,
    trips: [],
    issues: [],
    notifications: [],
    audit: orders.flatMap((o) => [
      { id: uid('a'), entity: o.id, at: o.createdAt, actor: 'STORE_MANAGER', text: 'Order created' },
      { id: uid('a'), entity: o.id, at: o.createdAt + 60_000, actor: 'SYSTEM', text: 'Order confirmed' },
    ]),
    ordersClosed: false,
    plan: 'NONE',
    deliveryDate: isoDay(1),
  }
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Actions that happen in the field and can be queued while offline. */
export type FieldEvent =
  | { type: 'LOAD_START'; tripId: string }
  | { type: 'LOAD_COUNT'; orderId: string; item: string; count: number }
  | { type: 'SHORTFALL'; orderId: string; item: string; missing: number; reason: string; photo?: string }
  | { type: 'LOAD_COMPLETE'; tripId: string }
  | { type: 'START_ROUTE'; tripId: string }
  | { type: 'ARRIVE'; orderId: string; tripId: string }
  | { type: 'DELIVER'; orderId: string; tripId: string; record: DeliveryRecord }
  | { type: 'PROOF'; orderId: string; photo?: string; signature?: string }
  | { type: 'VEHICLE_ISSUE'; vehicleId: string; tripId?: string; kind: string; note?: string }

export interface QueuedEvent {
  id: string
  at: number
  actor: Role
  event: FieldEvent
  status: 'pending' | 'failed'
  error?: string
}

export function describeEvent(e: FieldEvent, d: OpsData): string {
  const out = (orderId: string) => byId(d.outlets, byId(d.orders, orderId)?.outletId)?.id ?? orderId
  switch (e.type) {
    case 'LOAD_START':
      return `Loading started · ${e.tripId}`
    case 'LOAD_COUNT':
      return `${out(e.orderId)} · ${e.item} counted (${e.count})`
    case 'SHORTFALL':
      return `${out(e.orderId)} · shortfall reported`
    case 'LOAD_COMPLETE':
      return `Loading complete · ${e.tripId}`
    case 'START_ROUTE':
      return `Route started · ${e.tripId}`
    case 'ARRIVE':
      return `${out(e.orderId)} arrival`
    case 'DELIVER':
      return `${out(e.orderId)} delivery`
    case 'PROOF':
      return `${out(e.orderId)} proof ${e.photo ? 'photo' : 'signature'}`
    case 'VEHICLE_ISSUE':
      return `${e.vehicleId} · ${e.kind}`
  }
}

// ---------- helpers that mutate a draft ----------

function log(d: OpsData, entity: string, actor: Role | 'SYSTEM', text: string, at = Date.now()) {
  d.audit.push({ id: uid('a'), entity, at, actor, text })
}

function notify(d: OpsData, n: Omit<Notification, 'id' | 'at' | 'readBy'>) {
  d.notifications.unshift({ ...n, id: uid('n'), at: Date.now(), readBy: [] })
  if (d.notifications.length > 150) d.notifications.length = 150
}

function raise(d: OpsData, i: Omit<Issue, 'id' | 'createdAt'>) {
  const issue = { ...i, id: uid('ISS'), createdAt: Date.now() }
  d.issues.unshift(issue)
  return issue
}

const outletOf = (d: OpsData, o: Order) => byId(d.outlets, o.outletId)!
const tripOf = (d: OpsData, id?: string) => byId(d.trips, id)
const vehicleOf = (d: OpsData, t?: Trip) => byId(d.vehicles, t?.vehicleId)

const DONE: Order['status'][] = ['DELIVERED', 'PARTIAL', 'FAILED', 'RECEIVED']

/** Apply one field event. Pure over a cloned draft; safe to replay after reconnection. */
export function applyEvent(d: OpsData, q: Pick<QueuedEvent, 'actor' | 'event' | 'at'>, conflicts?: string[]) {
  const e = q.event
  const actor = q.actor
  switch (e.type) {
    case 'LOAD_START': {
      const t = tripOf(d, e.tripId)
      if (!t) return
      if (t.status === 'PLANNED') t.status = 'LOADING'
      log(d, t.vehicleId, actor, `Loading started for ${t.id}`, q.at)
      return
    }
    case 'LOAD_COUNT': {
      const o = byId(d.orders, e.orderId)
      if (!o) return
      o.loaded = { ...o.loaded, [e.item]: e.count }
      return
    }
    case 'SHORTFALL': {
      const o = byId(d.orders, e.orderId)
      if (!o) return
      const out = outletOf(d, o)
      o.shortfall = { item: e.item, missing: e.missing, reason: e.reason }
      log(d, o.id, actor, `Loading shortfall: ${e.missing} × ${e.item} (${e.reason})`, q.at)
      raise(d, {
        kind: 'SHORTFALL',
        severity: 'HIGH',
        title: `${out.id} loading shortfall`,
        detail: `${e.missing} ${e.item} ${e.missing === 1 ? 'crate' : 'crates'} missing · ${e.reason}`,
        tripId: o.tripId,
        vehicleId: tripOf(d, o.tripId)?.vehicleId,
        orderIds: [o.id],
      })
      notify(d, { to: ['DISPATCHER'], severity: 'WARNING', title: 'Loader shortfall', body: `${out.id}: ${e.missing} × ${e.item} missing`, link: '/dispatcher/issues' })
      return
    }
    case 'LOAD_COMPLETE': {
      const t = tripOf(d, e.tripId)
      if (!t) return
      t.status = 'LOADED'
      for (const id of t.stops) {
        const o = byId(d.orders, id)
        if (!o || o.status !== 'PLANNED') continue
        o.status = 'LOADED'
        log(d, o.id, actor, `Loaded onto ${t.vehicleId}`, q.at)
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'INFO', title: 'Vehicle loaded', body: `${o.id} is loaded on ${t.vehicleId}`, link: '/store' })
      }
      notify(d, { to: ['DRIVER'], vehicleId: t.vehicleId, severity: 'INFO', title: 'Route ready', body: `${t.id} is loaded — ${t.stops.length} stops`, link: '/driver' })
      log(d, t.vehicleId, actor, `${t.id} loading complete`, q.at)
      return
    }
    case 'START_ROUTE': {
      const t = tripOf(d, e.tripId)
      if (!t) return
      t.status = 'IN_PROGRESS'
      t.startedAt = q.at
      for (const id of t.stops) {
        const o = byId(d.orders, id)
        if (!o || !['LOADED', 'PLANNED'].includes(o.status)) continue
        o.status = 'IN_TRANSIT'
        log(d, o.id, actor, `Departed on ${t.vehicleId}`, q.at)
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'INFO', title: 'Driver departed', body: `${t.vehicleId} is on the way with ${o.id}`, link: '/store' })
      }
      return
    }
    case 'ARRIVE': {
      const o = byId(d.orders, e.orderId)
      if (!o || DONE.includes(o.status)) return
      if (o.tripId !== e.tripId) conflicts?.push(o.id)
      o.status = 'ARRIVED'
      o.delivery = { ...o.delivery, outcome: o.delivery?.outcome ?? 'DELIVERED', arrivedAt: q.at }
      log(d, o.id, actor, 'Driver arrived', q.at)
      notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'INFO', title: 'Delivery arriving', body: `${o.id} — the driver has arrived`, link: '/store' })
      return
    }
    case 'DELIVER': {
      const o = byId(d.orders, e.orderId)
      if (!o) return
      const out = outletOf(d, o)
      // Delivered goods win over a later reassignment: remove the order from any rescue trip.
      if (o.tripId && o.tripId !== e.tripId) {
        conflicts?.push(o.id)
        const other = tripOf(d, o.tripId)
        if (other) other.stops = other.stops.filter((s) => s !== o.id)
        o.tripId = e.tripId
      }
      const r = e.record
      o.delivery = { ...o.delivery, ...r }
      o.status = r.outcome === 'DELIVERED' ? 'DELIVERED' : r.outcome === 'PARTIAL' ? 'PARTIAL' : 'FAILED'
      const label = { DELIVERED: 'Delivered in full', PARTIAL: 'Partial delivery', REFUSED: 'Delivery refused', CLOSED: 'Outlet closed', NO_ACCESS: 'Unable to access' }[r.outcome]
      log(d, o.id, actor, `${label}${r.receiver ? ` · received by ${r.receiver}` : ''}${r.offline ? ' · recorded offline' : ''}`, r.completedAt ?? q.at)
      if (o.status === 'FAILED') {
        raise(d, { kind: 'DELIVERY_FAILED', severity: 'WARNING', title: `${out.id} ${label.toLowerCase()}`, detail: r.notes || 'Failed attempt recorded by driver', orderIds: [o.id], tripId: o.tripId, vehicleId: tripOf(d, o.tripId)?.vehicleId })
        notify(d, { to: ['DISPATCHER'], severity: 'WARNING', title: 'Failed delivery attempt', body: `${out.id}: ${label}`, link: '/dispatcher/issues' })
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'WARNING', title: 'Delivery attempt failed', body: `${o.id}: ${label}`, link: '/store' })
      } else {
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'INFO', title: 'Delivered — please confirm receipt', body: `${o.id} ${label.toLowerCase()}`, link: '/store' })
        notify(d, { to: ['DISPATCHER'], severity: 'INFO', title: 'Delivery completed', body: `${out.id} · ${o.id}`, link: '/dispatcher/live' })
      }
      const t = tripOf(d, o.tripId)
      if (t && t.stops.every((id) => DONE.includes(byId(d.orders, id)!.status))) {
        t.status = 'COMPLETED'
        log(d, t.vehicleId, actor, `${t.id} completed`, q.at)
      }
      return
    }
    case 'PROOF': {
      const o = byId(d.orders, e.orderId)
      if (!o) return
      o.delivery = { outcome: 'DELIVERED', ...o.delivery, ...(e.photo ? { photo: e.photo } : {}), ...(e.signature ? { signature: e.signature } : {}) }
      log(d, o.id, actor, `Proof of delivery ${e.photo ? 'photo' : 'signature'} attached`, q.at)
      return
    }
    case 'VEHICLE_ISSUE': {
      const v = byId(d.vehicles, e.vehicleId)
      if (!v) return
      const t = tripOf(d, e.tripId)
      const reefer = e.kind === 'Refrigeration failure'
      v.status = 'BREAKDOWN'
      if (t && t.status === 'IN_PROGRESS') t.status = 'PAUSED'
      const remaining = t ? t.stops.filter((id) => !DONE.includes(byId(d.orders, id)!.status)) : []
      const kind: IssueKind = reefer ? 'REEFER_FAILURE' : 'BREAKDOWN'
      raise(d, {
        kind,
        severity: 'CRITICAL',
        title: `${v.id} ${reefer ? 'refrigeration failure' : e.kind.toLowerCase()}`,
        detail: `${remaining.length} ${remaining.length === 1 ? 'delivery' : 'deliveries'} impacted${e.note ? ` · ${e.note}` : ''}`,
        vehicleId: v.id,
        tripId: t?.id,
        orderIds: remaining,
      })
      log(d, v.id, actor, `${e.kind} reported at ${fmtClock(q.at)}`, q.at)
      notify(d, { to: ['DISPATCHER'], severity: 'CRITICAL', title: `${v.id} ${reefer ? 'refrigeration failure' : 'breakdown'}`, body: `${remaining.length} deliveries impacted`, link: '/dispatcher/issues' })
      return
    }
  }
}

// ---------- dispatcher & store commands (always online) ----------

export const commands = {
  createOrder(d: OpsData, outletId: string, items: OrderItem[], notes: string, date: string) {
    const out = byId(d.outlets, outletId)!
    const clean = items.filter((i) => i.qty > 0)
    const temp = tempOf(out.brand, clean)
    const id = `ORD${1400 + d.orders.length + 51}`
    const o: Order = {
      id,
      outletId,
      brand: out.brand,
      temp,
      items: clean,
      ...measure(out.brand, clean),
      deliveryDate: date,
      status: 'CONFIRMED',
      priority: priorityOf(out, temp),
      createdAt: Date.now(),
      notes: notes || undefined,
    }
    d.orders.push(o)
    log(d, id, 'STORE_MANAGER', 'Order created')
    log(d, id, 'SYSTEM', 'Order confirmed')
    notify(d, { to: ['DISPATCHER'], severity: 'INFO', title: 'New order received', body: `${out.id} · ${o.id} · ${o.volumeM3} m³ ${temp.toLowerCase()}`, link: '/dispatcher/orders' })
    return id
  },

  closeOrders(d: OpsData) {
    d.ordersClosed = true
    for (const o of d.orders) if (o.status === 'CONFIRMED' && o.deliveryDate === d.deliveryDate) log(d, o.id, 'DISPATCHER', 'Orders closed · entered planning queue')
  },

  generatePlan(d: OpsData) {
    const res = generatePlan(d, d.deliveryDate)
    d.trips = [...d.trips.filter((t) => t.status !== 'DRAFT'), ...res.trips.filter((t) => t.status === 'DRAFT')]
    for (const [oid, tid] of Object.entries(res.assigned)) {
      const o = byId(d.orders, oid)!
      o.status = 'PLANNED'
      o.tripId = tid
      o.deferral = undefined
      log(d, o.id, 'SYSTEM', `Allocated to ${tripOf(d, tid)?.vehicleId} (draft plan)`)
    }
    for (const [oid, reason] of Object.entries(res.deferred)) {
      const o = byId(d.orders, oid)!
      o.status = 'DEFERRED'
      o.tripId = undefined
      o.deferral = { reason, customerMessage: customerMessageFor(reason), nextRecommendation: nextRecommendation(o), at: Date.now(), confirmed: false }
      log(d, o.id, 'SYSTEM', `Proposed deferral: ${reason}`)
    }
    d.plan = 'DRAFT'
    return { served: Object.keys(res.assigned).length, deferred: Object.keys(res.deferred).length, trips: res.trips.length, vehicles: new Set(res.trips.map((t) => t.vehicleId)).size }
  },

  publishPlan(d: OpsData) {
    for (const t of d.trips) if (t.status === 'DRAFT') t.status = 'PLANNED'
    for (const o of d.orders) {
      if (o.status === 'PLANNED') {
        const t = tripOf(d, o.tripId)!
        log(d, o.id, 'DISPATCHER', `Scheduled on ${t.vehicleId} · Trip ${t.number}`)
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'INFO', title: 'Delivery scheduled', body: `${o.id} on ${t.vehicleId}, Trip ${t.number}`, link: '/store' })
      }
      if (o.status === 'DEFERRED' && o.deferral && !o.deferral.confirmed) commands.confirmDeferral(d, o.id)
    }
    d.plan = 'PUBLISHED'
    notify(d, { to: ['LOADER'], severity: 'INFO', title: "Tomorrow's plan released", body: `${d.trips.filter((t) => t.status === 'PLANNED').length} trips ready for loading`, link: '/loader/trips' })
    notify(d, { to: ['DRIVER'], severity: 'INFO', title: 'Route assigned', body: 'Your trip for the next run is planned', link: '/driver' })
  },

  assign(d: OpsData, orderId: string, vehicleId: string) {
    const o = byId(d.orders, orderId)!
    const v = byId(d.vehicles, vehicleId)!
    const prev = tripOf(d, o.tripId)
    if (prev) prev.stops = prev.stops.filter((s) => s !== orderId)
    o.tripId = undefined
    const r = validate(o, v, d)
    if (!r.ok) {
      if (prev) prev.stops = sequence([...prev.stops, orderId], vehicleOf(d, prev)!, d)
      o.tripId = prev?.id
      return r
    }
    let t = r.trip.id ? tripOf(d, r.trip.id) : undefined
    if (!t) {
      const out = outletOf(d, o)
      t = { id: `TRP-${v.id.slice(3)}-${r.trip.number}`, vehicleId: v.id, number: r.trip.number, brand: o.brand, district: out.district, departure: r.trip.departure, stops: [], status: d.plan === 'PUBLISHED' ? 'PLANNED' : 'DRAFT' }
      d.trips.push(t)
    }
    t.stops = r.trip.stops
    o.tripId = t.id
    o.status = o.status === 'LOADED' ? 'LOADED' : 'PLANNED'
    o.deferral = undefined
    if (prev && prev.stops.length === 0 && prev.status === 'DRAFT') d.trips = d.trips.filter((x) => x.id !== prev.id)
    log(d, o.id, 'DISPATCHER', `Allocated to ${v.id} · Trip ${t.number}`)
    if (t.status !== 'DRAFT') {
      notify(d, { to: ['LOADER'], severity: 'WARNING', title: 'Trip changed', body: `${o.id} added to ${t.id}`, link: `/loader/load/${t.id}` })
      notify(d, { to: ['DRIVER'], vehicleId: v.id, severity: 'INFO', title: 'Route updated', body: `${outletOf(d, o).id} added to your route`, link: '/driver/route' })
    }
    return r
  },

  unassign(d: OpsData, orderId: string) {
    const o = byId(d.orders, orderId)!
    const t = tripOf(d, o.tripId)
    if (t) {
      t.stops = t.stops.filter((s) => s !== orderId)
      if (!t.stops.length && t.status === 'DRAFT') d.trips = d.trips.filter((x) => x.id !== t.id)
    }
    o.tripId = undefined
    o.status = 'CONFIRMED'
    o.deferral = undefined
    log(d, o.id, 'DISPATCHER', 'Returned to unassigned queue')
  },

  defer(d: OpsData, orderId: string, reason: string, customerMessage: string, internalNote?: string) {
    const o = byId(d.orders, orderId)!
    const t = tripOf(d, o.tripId)
    if (t) t.stops = t.stops.filter((s) => s !== orderId)
    o.tripId = undefined
    o.status = 'DEFERRED'
    o.deferral = { reason, customerMessage, internalNote, nextRecommendation: nextRecommendation(o), at: Date.now(), confirmed: false }
    commands.confirmDeferral(d, orderId)
  },

  confirmDeferral(d: OpsData, orderId: string) {
    const o = byId(d.orders, orderId)!
    if (!o.deferral) return
    o.deferral.confirmed = true
    o.deferral.at = Date.now()
    const out = outletOf(d, o)
    out.deferralsThisWeek += 1
    log(d, o.id, 'DISPATCHER', `Deferred: ${o.deferral.reason}`)
    notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'WARNING', title: 'Delivery rescheduled', body: `${o.id}: ${o.deferral.reason}`, link: '/store' })
  },

  resolveIssue(d: OpsData, issueId: string, decision: string) {
    const i = byId(d.issues, issueId)
    if (!i || i.resolved) return
    i.resolved = { at: Date.now(), by: 'DISPATCHER', decision }
    if (i.kind === 'SHORTFALL' && i.orderIds?.[0]) {
      const o = byId(d.orders, i.orderIds[0])!
      if (o.shortfall) o.shortfall.decision = decision
      log(d, o.id, 'DISPATCHER', `Shortfall decision: ${decision}`)
      if (decision === 'Defer order') {
        commands.defer(d, o.id, 'Inventory unavailable at loading', 'Some items were unavailable at the depot, so your delivery moved to the next run.')
      } else {
        const t = tripOf(d, o.tripId)
        notify(d, { to: ['LOADER'], severity: 'INFO', title: 'Shortfall decision', body: `${outletOf(d, o).id}: ${decision}`, link: t ? `/loader/load/${t.id}` : '/loader' })
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'WARNING', title: 'Order adjusted', body: `${o.shortfall?.missing} × ${o.shortfall?.item} unavailable — ${decision.toLowerCase()}`, link: '/store' })
      }
    }
  },

  applyRecovery(d: OpsData, issueId: string) {
    const i = byId(d.issues, issueId)!
    const t = tripOf(d, i.tripId)
    if (!t) return
    const plan = recoveryPlan(t.id, d)
    for (const opt of plan.options) {
      const v = byId(d.vehicles, opt.vehicleId)!
      for (const oid of opt.orderIds) {
        const o = byId(d.orders, oid)!
        t.stops = t.stops.filter((s) => s !== oid)
        o.tripId = undefined
        let target = d.trips.find((x) => x.vehicleId === v.id && x.number === t.number && x.status !== 'ABORTED' && x.status !== 'COMPLETED')
        if (!target) {
          target = { id: `TRP-${v.id.slice(3)}-R`, vehicleId: v.id, number: t.number, brand: t.brand, district: t.district, departure: t.departure + 110, stops: [], status: 'IN_PROGRESS', startedAt: Date.now() }
          d.trips.push(target)
        }
        target.stops = sequence([...target.stops, oid], v, d)
        o.tripId = target.id
        o.status = 'IN_TRANSIT'
        log(d, o.id, 'DISPATCHER', `Reassigned ${t.vehicleId} → ${v.id} after incident (+${opt.delayMin} min)`)
        notify(d, { to: ['STORE_MANAGER'], outletId: o.outletId, severity: 'WARNING', title: 'Delivery vehicle changed', body: `${o.id} now arrives on ${v.id} (about +${opt.delayMin} min)`, link: '/store' })
      }
      notify(d, { to: ['DRIVER'], vehicleId: v.id, severity: 'WARNING', title: 'Stops added to your route', body: `${opt.orderIds.length} recovered stops from ${t.vehicleId}`, link: '/driver/route' })
    }
    for (const oid of plan.defer) {
      commands.defer(d, oid, 'Required vehicle unavailable', 'The delivery vehicle broke down and no replacement could reach you inside your window. You have high priority on the next run.', `Incident ${i.id}`)
    }
    const moved = plan.options.reduce((s, o) => s + o.orderIds.length, 0)
    t.status = t.stops.some((id) => !DONE.includes(byId(d.orders, id)!.status)) ? 'PAUSED' : 'ABORTED'
    if (t.stops.every((id) => DONE.includes(byId(d.orders, id)!.status))) t.status = t.stops.length ? 'COMPLETED' : 'ABORTED'
    notify(d, { to: ['DRIVER'], vehicleId: t.vehicleId, severity: 'WARNING', title: 'Route updated', body: `${moved} stops reassigned${plan.defer.length ? `, ${plan.defer.length} deferred` : ''}. Remain safely stopped.`, link: '/driver/route' })
    i.resolved = { at: Date.now(), by: 'DISPATCHER', decision: `Recovery applied: ${moved} reassigned, ${plan.defer.length} deferred` }
  },

  confirmReceipt(d: OpsData, orderId: string, r: Omit<Receipt, 'at'>) {
    const o = byId(d.orders, orderId)!
    o.receipt = { ...r, at: Date.now() }
    o.status = 'RECEIVED'
    log(d, o.id, 'STORE_MANAGER', `Receipt confirmed · ${r.received} units · ${r.condition.toLowerCase()} · ${r.receiver}`)
    notify(d, { to: ['DISPATCHER'], severity: r.condition === 'GOOD' ? 'INFO' : 'WARNING', title: 'Receipt confirmed', body: `${o.outletId} · ${o.id}${r.condition !== 'GOOD' ? ` · ${r.condition.toLowerCase()}` : ''}`, link: '/dispatcher/history' })
    if (r.condition !== 'GOOD') commands.storeIssue(d, orderId, r.condition === 'MISSING' ? 'Missing goods' : r.condition === 'DAMAGED' ? 'Damaged goods' : 'Wrong product', 'Reported at receipt')
  },

  storeIssue(d: OpsData, orderId: string, kind: string, description: string) {
    const o = byId(d.orders, orderId)!
    raise(d, { kind: 'STORE_ISSUE', severity: 'WARNING', title: `${o.outletId} · ${kind}`, detail: description || kind, orderIds: [o.id] })
    log(d, o.id, 'STORE_MANAGER', `Issue reported: ${kind}`)
    notify(d, { to: ['DISPATCHER'], severity: 'WARNING', title: 'Store reported an issue', body: `${o.outletId}: ${kind}`, link: '/dispatcher/issues' })
  },

  acknowledgeDeferral(d: OpsData, orderId: string) {
    const o = byId(d.orders, orderId)!
    if (o.deferral) o.deferral.acknowledged = true
    log(d, o.id, 'STORE_MANAGER', 'Deferral acknowledged')
  },

  markRead(d: OpsData, role: Role) {
    for (const n of d.notifications) if (n.to.includes(role) && !n.readBy.includes(role)) n.readBy.push(role)
  },

  /** Demo helper: the rest of the fleet heads out so live operations have something to show. */
  simulateFleet(d: OpsData, keep: string) {
    const now = Date.now()
    let k = 0
    for (const t of d.trips) {
      if (t.vehicleId === keep || !['PLANNED', 'LOADING', 'LOADED'].includes(t.status) || t.number !== 1) continue
      t.status = 'IN_PROGRESS'
      t.startedAt = now - 90 * 60_000
      const done = Math.floor(t.stops.length * (0.3 + ((k++ * 37) % 50) / 100))
      t.stops.forEach((id, idx) => {
        const o = byId(d.orders, id)!
        if (idx < done) {
          o.status = 'DELIVERED'
          o.delivery = { outcome: 'DELIVERED', receiver: byId(d.outlets, o.outletId)!.manager, completedAt: now - (done - idx) * 18 * 60_000 }
          log(d, o.id, 'DRIVER', 'Delivered in full', o.delivery.completedAt)
        } else o.status = 'IN_TRANSIT'
      })
    }
    for (const t of d.trips) if (t.number === 1 && t.vehicleId !== keep && t.status === 'PLANNED') t.status = 'LOADED'
    const late = d.trips.find((t) => t.status === 'IN_PROGRESS' && t.stops.length > 3)
    if (late) {
      const oid = late.stops[late.stops.length - 1]
      const o = byId(d.orders, oid)!
      raise(d, { kind: 'LATE_RISK', severity: 'HIGH', title: `${o.outletId} missed window risk`, detail: `${late.vehicleId} running 18 min behind plan`, orderIds: [oid], tripId: late.id, vehicleId: late.vehicleId })
    }
    const fuel = d.vehicles.find((v) => v.id === 'VEH024')
    if (fuel) raise(d, { kind: 'FUEL', severity: 'INFO', title: 'VEH024 fuel quota', detail: `${Math.round((fuel.fuelUsedL / fuel.fuelQuotaL) * 100)}% of weekly quota used`, vehicleId: 'VEH024' })
  },
}

export function severityRank(s: Severity) {
  return { CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3 }[s]
}

