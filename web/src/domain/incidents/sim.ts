import { DEPOT_GEO, outletGeo, type LatLng } from '../geo'
import { byId, schedule } from '../rules'
import { hm } from '../time'
import type { District, Minutes, Order, Trip } from '../types'
import type { OpsData } from '../../store/events'
import type { GpsPoint, Scenario } from './types'

/** Geofence radius around a store, in km. */
export const GEOFENCE_KM = 0.15

export function km(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

const lerp = (a: LatLng, b: LatLng, k: number): LatLng => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]

/** Move a point sideways from the a→b line by `off` km (positive = left). */
function sideways(a: LatLng, b: LatLng, at: number, off: number): LatLng {
  const p = lerp(a, b, at)
  const dy = b[0] - a[0]
  const dx = (b[1] - a[1]) * Math.cos((p[0] * Math.PI) / 180)
  const len = Math.hypot(dx, dy) || 1
  const nLat = (dx / len) * (off / 111)
  const nLng = (-dy / len) * (off / (111 * Math.cos((p[0] * Math.PI) / 180)))
  return [p[0] + nLat, p[1] + nLng]
}

/** Deterministic jitter so trails look like GPS, not rulers. */
function jitter(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 0.0004
}

export interface SimStop {
  orderId: string
  outletId: string
  plannedDone: Minutes
  windowStart: Minutes
  windowEnd: Minutes
  arrive: Minutes
  done: Minutes
  outcome: 'DELIVERED' | 'PARTIAL' | 'CLOSED'
  deliveredAt: LatLng
  inGeofence: boolean
  dwell: number
}

export interface SimTrip {
  tripId: string
  scenario: Scenario
  trail: GpsPoint[]
  stops: SimStop[]
  /** Planned position over time, used to measure how far behind the vehicle is. */
  plan: { t: Minutes; p: LatLng }[]
}

const cache = new Map<string, SimTrip>()

/**
 * Turn a planned trip into what "really" happens on the road under a scenario:
 * a minute-by-minute GPS trail plus actual arrival/finish times per stop.
 */
export function simulateTrip(d: OpsData, trip: Trip, scenario: Scenario): SimTrip {
  const key = `${trip.id}|${trip.stops.join(',')}|${scenario}|${trip.departure}`
  const hit = cache.get(key)
  if (hit) return hit
  const vehicle = byId(d.vehicles, trip.vehicleId)!
  const sch = schedule(trip.stops, trip.departure, vehicle, d)
  const depot = DEPOT_GEO[vehicle.depot]
  const trail: GpsPoint[] = []
  const plan: { t: Minutes; p: LatLng }[] = [{ t: trip.departure, p: depot }]
  const stops: SimStop[] = []

  let t = trip.departure
  let pos: LatLng = depot
  let seed = trip.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const push = (p: LatLng, time: Minutes) => {
    const prev = trail[trail.length - 1]
    const pt: LatLng = [p[0] + jitter(seed++), p[1] + jitter(seed++)]
    const v = prev && time > prev.t ? (km([prev.lat, prev.lng], pt) / (time - prev.t)) * 60 : 0
    trail.push({ t: time, lat: pt[0], lng: pt[1], v: Math.round(v) })
  }
  const drive = (path: LatLng[], minutes: number) => {
    // Distribute time along a polyline in 1-minute steps.
    const segs = path.slice(1).map((p, i) => km(path[i], p))
    const total = segs.reduce((a, b) => a + b, 0) || 1
    const steps = Math.max(1, Math.round(minutes))
    for (let s = 1; s <= steps; s++) {
      let dist = (s / steps) * total
      let i = 0
      while (i < segs.length - 1 && dist > segs[i]) dist -= segs[i++]
      push(lerp(path[i], path[i + 1], segs[i] ? dist / segs[i] : 1), t + (s * minutes) / steps)
    }
    t += minutes
    pos = path[path.length - 1]
  }
  const wait = (minutes: number) => {
    for (let s = 1; s <= Math.round(minutes); s++) push(pos, t + s)
    t += minutes
  }

  push(depot, t)
  let prevPlannedDone = trip.departure
  sch.stops.forEach((st, i) => {
    const outlet = byId(d.outlets, st.outletId)!
    const here = outletGeo(outlet)
    let travel = Math.max(3, st.eta - prevPlannedDone)
    plan.push({ t: st.eta, p: here }, { t: st.start + st.service, p: here })
    prevPlannedDone = st.start + st.service

    // Monsoon flooding: every leg after 04:40 crawls.
    if (scenario === 'CONGESTION' && t >= hm(4, 40)) travel = travel * 2 + 45
    const target = i === 1 ? scenario : 'NORMAL'
    if (target === 'DETOUR') {
      drive([pos, sideways(pos, here, 0.5, 2.4), here], travel + 110)
    } else if (target === 'STATIONARY') {
      drive([pos, lerp(pos, here, 0.45)], travel * 0.45)
      wait(120)
      drive([pos, here], travel * 0.55)
    } else if (target === 'GHOST') {
      // Marks the stop delivered ~1 km short of the store and never enters the geofence.
      const short = lerp(pos, here, 0.8)
      drive([pos, short], travel * 0.8)
      const arrive = t
      wait(6)
      stops.push({ orderId: st.orderId, outletId: st.outletId, plannedDone: st.start + st.service, windowStart: st.window[0], windowEnd: st.window[1], arrive, done: t, outcome: 'DELIVERED', deliveredAt: short, inGeofence: false, dwell: 6 })
      return
    } else {
      drive([pos, here], travel)
    }

    const arrive = t
    if (target === 'CLOSED') {
      wait(15)
      stops.push({ orderId: st.orderId, outletId: st.outletId, plannedDone: st.start + st.service, windowStart: st.window[0], windowEnd: st.window[1], arrive, done: t, outcome: 'CLOSED', deliveredAt: here, inGeofence: true, dwell: 15 })
      return
    }
    const start = Math.max(t, st.window[0])
    wait(start - t + st.service)
    stops.push({
      orderId: st.orderId,
      outletId: st.outletId,
      plannedDone: st.start + st.service,
      windowStart: st.window[0],
      windowEnd: st.window[1],
      arrive,
      done: t,
      outcome: scenario === 'SHORT' && i === 0 ? 'PARTIAL' : 'DELIVERED',
      deliveredAt: here,
      inGeofence: true,
      dwell: Math.round(t - arrive),
    })
  })
  drive([pos, depot], 18)
  const res = { tripId: trip.id, scenario, trail, stops, plan }
  cache.set(key, res)
  return res
}

/** Where the plan says the vehicle should be at time t. */
export function plannedAt(sim: SimTrip, t: Minutes): LatLng {
  const p = sim.plan
  if (t <= p[0].t) return p[0].p
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i].t) return lerp(p[i - 1].p, p[i].p, (t - p[i - 1].t) / Math.max(1, p[i].t - p[i - 1].t))
  }
  return p[p.length - 1].p
}

/** Distance from a point to a segment a→b, in km (local flat projection — fine at city scale). */
function segKm(p: LatLng, a: LatLng, b: LatLng) {
  const kx = 111 * Math.cos((a[0] * Math.PI) / 180)
  const ax = 0, ay = 0
  const bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * 111
  const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * 111
  const len2 = bx * bx + by * by
  const k = len2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2)) : 0
  return Math.hypot(px - k * bx, py - k * by)
}

/** Distance from a point to the planned path (depot → stops → depot), in km. */
export function offPlanKm(sim: SimTrip, pt: LatLng) {
  const path = [...sim.plan.map((x) => x.p), sim.plan[0].p]
  let best = Infinity
  for (let i = 1; i < path.length; i++) best = Math.min(best, segKm(pt, path[i - 1], path[i]))
  return best
}

/**
 * Give today's live trips their "story". One district gets congestion (so a
 * zone-wide notice is warranted); single trips get one incident each.
 */
export function assignScenarios(trips: Trip[], keep: string): { scenarios: Record<string, Scenario>; congested?: District } {
  const live = trips.filter((t) => t.vehicleId !== keep).sort((a, b) => a.id.localeCompare(b.id))
  const byDistrict = new Map<District, Trip[]>()
  for (const t of live) byDistrict.set(t.district, [...(byDistrict.get(t.district) ?? []), t])
  const candidates = [...byDistrict.entries()].filter(([, ts]) => ts.length >= 3).sort((a, b) => (a[0] === 'Colombo' ? 1 : 0) - (b[0] === 'Colombo' ? 1 : 0) || b[1].length - a[1].length)
  const congested = candidates[0]?.[0]
  const scenarios: Record<string, Scenario> = {}
  const singles: Scenario[] = ['STATIONARY', 'DETOUR', 'GHOST', 'CLOSED', 'SHORT', 'CLAIM']
  let k = 0
  for (const t of live) {
    if (t.district === congested) scenarios[t.id] = 'CONGESTION'
    else if (t.stops.length >= 2 && k < singles.length) scenarios[t.id] = singles[k++]
    else scenarios[t.id] = 'NORMAL'
  }
  return { scenarios, congested }
}

/** Unit prices used to value orders for credits (LKR). */
const PRICE: Record<string, number> = {
  Milk: 4800,
  Yoghurt: 3600,
  'Frozen goods': 6200,
  Produce: 2900,
  'Dry goods': 3400,
  Apparel: 18500,
  Footwear: 22000,
  Electronics: 65000,
  Accessories: 5200,
}
export const unitPrice = (item: string) => PRICE[item] ?? 3000
export const orderValue = (o: Order) => o.items.reduce((s, i) => s + unitPrice(i.name) * i.qty, 0)
export const lkr = (n: number) => `LKR ${Math.round(n).toLocaleString('en-LK')}`
