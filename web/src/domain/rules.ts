import { DEPOTS, isReefer, isVan } from './seed'
import { fmtMin, hm, nextOperatingDate } from './time'
import type { Brand, Minutes, Order, Outlet, Trip, Vehicle } from './types'

export const TRIP_LIMIT_MIN = 270
/** A vehicle makes at most two delivery trips a day. */
export const TRIPS_PER_VEHICLE = 2
/** Every Fresh outlet must have its delivery completed before 08:00. */
export const FRESH_DEADLINE = hm(8)
/** Minimum depot turnaround between Trip 1 returning and Trip 2 leaving. */
export const TURNAROUND_MIN = 20

export interface World {
  orders: Order[]
  outlets: Outlet[]
  vehicles: Vehicle[]
  trips: Trip[]
}

export const byId = <T extends { id: string }>(list: T[], id?: string) => (id ? list.find((x) => x.id === id) : undefined)

/** Fresh runs early (trip 1); Style and Tech run later in the day (trip 2). */
export const sessionOf = (brand: Brand): 1 | 2 => (brand === 'Fresh' ? 1 : 2)
export const departureFor = (brand: Brand): Minutes => (brand === 'Fresh' ? hm(3, 45) : brand === 'Style' ? hm(8, 30) : hm(12, 15))

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const travelMin = (a: { x: number; y: number }, b: { x: number; y: number }) => 5 + dist(a, b) * 1.7
export const serviceMin = (o: Order) => Math.round(10 + o.volumeM3 * 2.2)

export interface StopPlan {
  orderId: string
  outletId: string
  eta: Minutes
  start: Minutes
  window: [Minutes, Minutes]
  service: number
  late: boolean
  /** Fresh delivery would finish after 08:00. */
  freshLate: boolean
  lateRisk: number // 0–100
}

export interface Schedule {
  stops: StopPlan[]
  finish: Minutes
  totalMin: number
  distance: number
  fuelL: number
  weightKg: number
  volumeM3: number
}

/** Walk a stop sequence from the depot and back, honouring delivery windows. */
export function schedule(stopIds: string[], departure: Minutes, vehicle: Vehicle, w: Pick<World, 'orders' | 'outlets'>, delay = 0): Schedule {
  const depot = DEPOTS[vehicle.depot]
  let pos = depot
  let t = departure + delay
  let distance = 0
  let weightKg = 0
  let volumeM3 = 0
  const stops: StopPlan[] = []
  for (const id of stopIds) {
    const o = byId(w.orders, id)
    const out = o && byId(w.outlets, o.outletId)
    if (!o || !out) continue
    distance += dist(pos, out)
    t += travelMin(pos, out)
    const eta = t
    const start = Math.max(t, out.window[0])
    const service = serviceMin(o)
    const fresh = o.brand === 'Fresh'
    const deadline = fresh ? Math.min(out.window[1], FRESH_DEADLINE - service) : out.window[1]
    const slack = deadline - start
    stops.push({
      orderId: id,
      outletId: out.id,
      eta,
      start,
      window: out.window,
      service,
      late: start > out.window[1],
      freshLate: fresh && start + service > FRESH_DEADLINE,
      lateRisk: Math.max(2, Math.min(98, Math.round(60 - slack * 0.9))),
    })
    t = start + service
    pos = out
    weightKg += o.weightKg
    volumeM3 += o.volumeM3
  }
  distance += dist(pos, depot)
  t += stopIds.length ? travelMin(pos, depot) : 0
  return {
    stops,
    finish: t,
    totalMin: t - departure,
    distance,
    fuelL: Math.round(distance * 0.42 + stops.length * 0.9),
    weightKg: Math.round(weightKg),
    volumeM3: Math.round(volumeM3 * 10) / 10,
  }
}

/** Nearest-neighbour sequencing, tie-broken by earliest window close. */
export function sequence(stopIds: string[], vehicle: Vehicle, w: Pick<World, 'orders' | 'outlets'>): string[] {
  const left = stopIds.map((id) => {
    const o = byId(w.orders, id)!
    return { id, out: byId(w.outlets, o.outletId)! }
  })
  const out: string[] = []
  let pos: { x: number; y: number } = DEPOTS[vehicle.depot]
  while (left.length) {
    left.sort((a, b) => travelMin(pos, a.out) + a.out.window[1] / 30 - (travelMin(pos, b.out) + b.out.window[1] / 30))
    const next = left.shift()!
    out.push(next.id)
    pos = next.out
  }
  return out
}

export function weeklyFuel(vehicle: Vehicle, w: World, extraTrip?: { stops: string[]; departure: Minutes; replaces?: string }) {
  let used = vehicle.fuelUsedL
  for (const t of w.trips) {
    if (t.vehicleId !== vehicle.id || t.status === 'ABORTED' || t.id === extraTrip?.replaces) continue
    used += schedule(t.stops, t.departure, vehicle, w).fuelL
  }
  if (extraTrip) used += schedule(extraTrip.stops, extraTrip.departure, vehicle, w).fuelL
  return used
}

export type CheckKey = 'status' | 'weight' | 'volume' | 'temperature' | 'depot' | 'access' | 'brand' | 'district' | 'window' | 'fresh' | 'time' | 'fuel' | 'trips' | 'turnaround'

export interface Check {
  key: CheckKey
  label: string
  ok: boolean
  /** Warnings are shown but never block the allocation. */
  blocking: boolean
  detail: string
}

export interface Validation {
  ok: boolean
  checks: Check[]
  trip: { id?: string; number: 1 | 2; stops: string[]; departure: Minutes }
  schedule: Schedule
  fuelProjected: number
}

/** Would adding `order` to `vehicle` keep every operating constraint? */
export function validate(order: Order, vehicle: Vehicle, w: World): Validation {
  const outlet = byId(w.outlets, order.outletId)!
  const session = sessionOf(order.brand)
  const existing = w.trips.find((t) => t.vehicleId === vehicle.id && t.number === session && t.status !== 'ABORTED' && t.status !== 'COMPLETED')
  const baseStops = (existing?.stops ?? []).filter((id) => id !== order.id)
  const departure = existing?.departure ?? departureFor(order.brand)
  const stops = sequence([...baseStops, order.id], vehicle, w)
  const sch = schedule(stops, departure, vehicle, w)
  const tripCount = w.trips.filter((t) => t.vehicleId === vehicle.id && t.status !== 'ABORTED').length
  const fuel = weeklyFuel(vehicle, w, { stops, departure, replaces: existing?.id })
  const lateStop = sch.stops.find((s) => s.late)
  const lateOutlet = lateStop && byId(w.outlets, lateStop.outletId)
  const freshLate = sch.stops.find((s) => s.freshLate)
  const lastFresh = order.brand === 'Fresh' && sch.stops.length ? sch.stops[sch.stops.length - 1] : undefined
  // Trip 2 can only leave once Trip 1 is back at the depot.
  const trip1 = session === 2 ? w.trips.find((t) => t.vehicleId === vehicle.id && t.number === 1 && t.status !== 'ABORTED') : undefined
  const trip1Back = trip1 ? schedule(trip1.stops, trip1.departure, vehicle, w).finish + TURNAROUND_MIN : undefined

  const checks: Check[] = [
    { key: 'status', label: 'Vehicle available', ok: vehicle.status === 'AVAILABLE', blocking: true, detail: vehicle.status === 'AVAILABLE' ? 'Ready for dispatch' : `${vehicle.id} is ${vehicle.status.toLowerCase()}` },
    { key: 'weight', label: 'Weight', ok: sch.weightKg <= vehicle.capacityKg, blocking: true, detail: `${sch.weightKg.toLocaleString()} / ${vehicle.capacityKg.toLocaleString()} kg` },
    { key: 'volume', label: 'Volume', ok: sch.volumeM3 <= vehicle.capacityM3, blocking: true, detail: `${sch.volumeM3} / ${vehicle.capacityM3} m³` },
    {
      key: 'temperature',
      label: 'Temperature',
      ok: order.temp === 'AMBIENT' || isReefer(vehicle.type),
      blocking: true,
      detail: order.temp === 'CHILLED' ? (isReefer(vehicle.type) ? 'Reefer for chilled goods' : 'Chilled goods require a REEFER') : 'Ambient goods',
    },
    { key: 'brand', label: 'Single brand per trip', ok: !existing || existing.brand === order.brand, blocking: true, detail: existing ? `Trip serves ${existing.brand}; order is ${order.brand}` : `New ${order.brand} trip` },
    { key: 'depot', label: 'Depot', ok: outlet.depot === vehicle.depot, blocking: true, detail: outlet.depot === vehicle.depot ? `${vehicle.depot}` : `Outlet served from ${outlet.depot}` },
    {
      key: 'access',
      label: 'Vehicle access',
      ok: !outlet.vanOnly || isVan(vehicle.type),
      blocking: true,
      detail: outlet.vanOnly ? (isVan(vehicle.type) ? 'Van-only outlet · van selected' : `${outlet.id} is VAN ONLY`) : 'No access restriction',
    },
    {
      key: 'district',
      label: 'District grouping',
      ok: !existing || byId(w.outlets, byId(w.orders, existing.stops[0])?.outletId)?.district === outlet.district || existing.stops.length === 0,
      blocking: false,
      detail: existing ? `Trip serves ${existing.district}` : `New trip · ${outlet.district}`,
    },
    {
      key: 'window',
      label: 'Delivery windows',
      ok: !lateStop,
      blocking: true,
      detail: lateStop ? `${lateOutlet?.id} arrives ${fmtMin(lateStop.start)} after ${fmtMin(lateStop.window[1])}` : 'All stops inside window',
    },
    {
      key: 'fresh',
      label: 'Fresh by 08:00',
      ok: !freshLate,
      blocking: true,
      detail: order.brand !== 'Fresh' ? 'Not a Fresh trip' : freshLate ? `${byId(w.outlets, freshLate.outletId)?.id} finishes ${fmtMin(freshLate.start + freshLate.service)}` : `Last drop done ${fmtMin((lastFresh?.start ?? 0) + (lastFresh?.service ?? 0))}`,
    },
    { key: 'time', label: 'Trip time', ok: sch.totalMin <= TRIP_LIMIT_MIN, blocking: true, detail: `${Math.round(sch.totalMin)} / ${TRIP_LIMIT_MIN} min` },
    { key: 'fuel', label: 'Fuel quota', ok: fuel <= vehicle.fuelQuotaL, blocking: true, detail: `${Math.round(fuel)} / ${vehicle.fuelQuotaL} L this week` },
    {
      key: 'trips',
      label: 'Trip limit',
      ok: !!existing || tripCount < TRIPS_PER_VEHICLE,
      blocking: true,
      detail: `${existing ? tripCount : tripCount + 1} / ${TRIPS_PER_VEHICLE} trips today`,
    },
    {
      key: 'turnaround',
      label: 'Depot turnaround',
      ok: trip1Back === undefined || departure >= trip1Back,
      blocking: true,
      detail: trip1Back === undefined ? 'First trip of the day' : departure >= trip1Back ? `Trip 1 back ${fmtMin(trip1Back - TURNAROUND_MIN)}` : `Trip 1 returns ${fmtMin(trip1Back - TURNAROUND_MIN)}, after Trip 2 leaves`,
    },
  ]
  return {
    ok: checks.every((c) => c.ok || !c.blocking),
    checks,
    trip: { id: existing?.id, number: session, stops, departure },
    schedule: sch,
    fuelProjected: fuel,
  }
}

export function suggestVehicles(order: Order, w: World, exclude?: string, limit = 3) {
  return w.vehicles
    .filter((v) => v.id !== exclude)
    .map((v) => ({ v, r: validate(order, v, w) }))
    .filter((x) => x.r.ok)
    .sort((a, b) => b.r.schedule.volumeM3 / b.v.capacityM3 - a.r.schedule.volumeM3 / a.v.capacityM3)
    .slice(0, limit)
    .map((x) => x.v)
}

export function deferralReason(order: Order, w: World): string {
  const outlet = byId(w.outlets, order.outletId)!
  const compatible = w.vehicles.filter((v) => v.depot === outlet.depot && v.status === 'AVAILABLE')
  if (order.temp === 'CHILLED' && !compatible.some((v) => isReefer(v.type) && validate(order, v, w).checks.find((c) => c.key === 'volume')?.ok))
    return 'Refrigerated capacity exhausted'
  if (outlet.vanOnly && !compatible.some((v) => isVan(v.type) && validate(order, v, w).ok)) return 'Required vehicle unavailable (van-only access)'
  if (order.brand === 'Fresh' && compatible.every((v) => !validate(order, v, w).checks.find((c) => c.key === 'fresh')?.ok)) return 'Fresh 08:00 deadline cannot be met'
  if (compatible.every((v) => !validate(order, v, w).checks.find((c) => c.key === 'window')?.ok)) return 'Time-window conflict'
  if (compatible.every((v) => !validate(order, v, w).checks.find((c) => c.key === 'trips')?.ok)) return 'Every vehicle has used its 2 trips'
  return 'Capacity exhausted'
}

export const nextRecommendation = (o: Order) => `${nextOperatingDate(o.deliveryDate)} · Trip ${sessionOf(o.brand)}`

export const customerMessageFor = (reason: string) => {
  if (reason.startsWith('Refrigerated')) return 'Required refrigerated capacity was unavailable for this run. Your order has high priority for the next run.'
  if (reason.startsWith('Required vehicle')) return 'The vehicle type your outlet requires was unavailable for this run.'
  if (reason.startsWith('Fresh')) return 'Fresh goods must arrive before 08:00 and no vehicle could reach you in time on this run. You have high priority for the next morning run.'
  if (reason.startsWith('Every vehicle')) return 'All vehicles had already used their two trips for the day. Your order has been prioritised for the next run.'
  if (reason.startsWith('Time')) return 'We could not reach your outlet inside its delivery window on this run.'
  if (reason.startsWith('Fuel')) return 'Fleet fuel limits prevented a safe allocation on this run.'
  return 'Delivery capacity for this run was fully used. Your order has been prioritised for the next run.'
}


/**
 * Greedy constraint-aware planner. Highest priority first; fill compatible
 * trips best-fit before opening a new vehicle; anything left is deferred with a reason.
 */
export function generatePlan(w: World, deliveryDate?: string): { trips: Trip[]; assigned: Record<string, string>; deferred: Record<string, string> } {
  const trips: Trip[] = w.trips.filter((t) => t.status !== 'DRAFT').map((t) => ({ ...t, stops: [...t.stops] }))
  const world: World = { ...w, trips }
  const assigned: Record<string, string> = {}
  const deferred: Record<string, string> = {}
  const reserved = new Set(w.orders.map((o) => o.seedVehicle).filter(Boolean))
  const queue = w.orders
    .filter((o) => o.status === 'CONFIRMED' && !o.tripId && (!deliveryDate || o.deliveryDate === deliveryDate))
    .sort((a, b) => (b.seedVehicle ? 1 : 0) - (a.seedVehicle ? 1 : 0) || b.priority - a.priority)

  for (const order of queue) {
    const outlet = byId(w.outlets, order.outletId)!
    const session = sessionOf(order.brand)
    const tryVehicle = (v: Vehicle) => {
      const r = validate(order, v, world)
      if (!r.ok) return false
      if (!r.checks.find((c) => c.key === 'district')!.ok) return false
      let trip = r.trip.id ? trips.find((t) => t.id === r.trip.id) : undefined
      if (!trip) {
        trip = { id: `TRP-${v.id.slice(3)}-${session}`, vehicleId: v.id, number: session, brand: order.brand, district: outlet.district, departure: r.trip.departure, stops: [], status: 'DRAFT' }
        trips.push(trip)
      }
      if (trip.brand !== order.brand && trip.stops.length) return false
      trip.stops = r.trip.stops
      assigned[order.id] = trip.id
      return true
    }
    if (order.seedVehicle && tryVehicle(byId(w.vehicles, order.seedVehicle)!)) continue

    // 1. Existing trips in the same session & district, fullest first (best fit).
    const open = trips
      .filter((t) => t.number === session && t.district === outlet.district && t.brand === order.brand && t.status === 'DRAFT' && !reserved.has(t.vehicleId))
      .map((t) => ({ t, v: byId(w.vehicles, t.vehicleId)! }))
      .sort((a, b) => schedule(b.t.stops, b.t.departure, b.v, world).volumeM3 / b.v.capacityM3 - schedule(a.t.stops, a.t.departure, a.v, world).volumeM3 / a.v.capacityM3)
    if (open.some(({ v }) => tryVehicle(v))) continue

    // 2. Open a new trip. Keep reefers for chilled goods, vans for van-only outlets.
    const fresh = w.vehicles
      .filter((v) => v.status === 'AVAILABLE' && !v.standby && v.depot === outlet.depot && !trips.some((t) => t.vehicleId === v.id && t.number === session) && !(reserved.has(v.id) && session === 1))
      .sort((a, b) => rank(a) - rank(b))
    function rank(v: Vehicle) {
      const reefer = isReefer(v.type)
      const van = isVan(v.type)
      let s = 0
      if (order.temp === 'CHILLED') s += reefer ? 0 : 100
      else s += reefer ? 40 : 0
      if (outlet.vanOnly) s += van ? 0 : 100
      else s += van ? 10 : 0
      return s - v.capacityM3 / 10
    }
    if (fresh.some((v) => tryVehicle(v))) continue

    deferred[order.id] = deferralReason(order, world)
  }
  return { trips: trips.filter((t) => t.stops.length), assigned, deferred }
}

export interface RecoveryOption {
  vehicleId: string
  orderIds: string[]
  delayMin: number
  checks: string[]
}

/** When a vehicle stops mid-route, find other vehicles that can absorb its remaining stops. */
export function recoveryPlan(tripId: string, w: World): { options: RecoveryOption[]; defer: string[] } {
  const trip = byId(w.trips, tripId)!
  const broken = byId(w.vehicles, trip.vehicleId)!
  const remaining = trip.stops.filter((id) => {
    const s = byId(w.orders, id)?.status
    return s && !['DELIVERED', 'PARTIAL', 'FAILED', 'RECEIVED'].includes(s)
  })
  const oldSch = schedule(trip.stops, trip.departure, broken, w)
  const trips = w.trips.map((t) => ({ ...t, stops: [...t.stops] }))
  const world: World = { ...w, trips }
  const options: Record<string, RecoveryOption> = {}
  const defer: string[] = []
  for (const id of remaining) {
    const order = byId(w.orders, id)!
    let placed = false
    const candidates = w.vehicles
      .filter((v) => v.id !== broken.id && v.status === 'AVAILABLE' && v.depot === broken.depot)
      .sort((a, b) => (options[b.id] ? 1 : 0) - (options[a.id] ? 1 : 0) || (b.standby ? 1 : 0) - (a.standby ? 1 : 0) || (isReefer(a.type) === (order.temp === 'CHILLED') ? -1 : 1))
    for (const v of candidates) {
      // Rescue vehicles leave once the incident is known, so delay the departure.
      const r = validate(order, v, world)
      const existing = trips.find((t) => t.vehicleId === v.id && t.number === trip.number && t.status !== 'ABORTED')
      const departure = existing?.departure ?? trip.departure + 110
      const sch = schedule(r.trip.stops, departure, v, world)
      const late = sch.stops.find((s) => s.late)
      const blocking = r.checks.filter((c) => c.blocking && !c.ok && c.key !== 'window' && c.key !== 'fresh')
      const tooLate = sch.stops.find((s) => s.late || s.freshLate)
      if (blocking.length || late || tooLate) continue
      if (existing) existing.stops = r.trip.stops
      else trips.push({ id: `rescue-${v.id}`, vehicleId: v.id, number: trip.number, brand: trip.brand, district: trip.district, departure, stops: r.trip.stops, status: 'DRAFT' })
      const newEta = sch.stops.find((s) => s.orderId === id)!.start
      const oldEta = oldSch.stops.find((s) => s.orderId === id)?.start ?? newEta
      const opt = (options[v.id] ??= {
        vehicleId: v.id,
        orderIds: [],
        delayMin: 0,
        checks: [isReefer(v.type) ? 'Reefer' : 'Ambient', 'Available', 'Same depot', 'Capacity available'],
      })
      opt.orderIds.push(id)
      opt.delayMin = Math.max(opt.delayMin, Math.max(4, Math.round(newEta - oldEta)))
      placed = true
      break
    }
    if (!placed) defer.push(id)
  }
  return { options: Object.values(options), defer }
}
