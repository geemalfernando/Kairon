import { schedule } from './rules'
import type { Brand, Depot, Order } from './types'
import type { OpsData } from '../store/events'

export type PredictionMode = 'READY' | 'LOW_CONFIDENCE' | 'STALE' | 'UNAVAILABLE'
export interface IntelligenceState {
  mode: PredictionMode
  updatedAt: number
  reviews: { orderId: string; note: string; at: number }[]
  capacityPlans: { id: string; depot: Depot; brand: Brand; week: string; extraVehicles: number; refrigerated: boolean; note: string; at: number }[]
}
export const MODE_LABELS: Record<PredictionMode, string> = { READY: 'Demo estimates available', LOW_CONFIDENCE: 'Low confidence', STALE: 'Inputs out of date', UNAVAILABLE: 'Predictions unavailable' }
export function newIntelligence(): IntelligenceState {
  return { mode: 'READY', updatedAt: Date.now(), reviews: [], capacityPlans: [] }
}
export interface StopPrediction {
  orderId: string
  tripId?: string
  serviceMin: number
  serviceRange: [number, number]
  arrival: number | null
  arrivalRange: [number, number] | null
  lateProbability: number | null
  confidence: 'Illustrative' | 'Low' | 'Fallback'
  source: 'Demo estimate' | 'Planning allowance'
  reasons: string[]
  needsReview: boolean
}

/** Transparent demo estimates, not a trained/calibrated ML model. No actual outcomes are used. */
export function predictStops(d: OpsData, mode: PredictionMode = d.intelligence?.mode ?? 'READY', online = true): StopPrediction[] {
  const fallback = !online || mode === 'UNAVAILABLE' || mode === 'STALE'
  const plans = new Map<string, { eta: number; tripId: string }>()
  for (const trip of d.trips.filter((t) => t.status !== 'ABORTED')) {
    const vehicle = d.vehicles.find((v) => v.id === trip.vehicleId)
    if (!vehicle) continue
    for (const stop of schedule(trip.stops, trip.departure, vehicle, d).stops) plans.set(stop.orderId, { eta: stop.eta, tripId: trip.id })
  }
  return d.orders.map((order) => {
    const outlet = d.outlets.find((o) => o.id === order.outletId)
    const plan = plans.get(order.id)
    const allowance = Math.round(10 + order.volumeM3 * 2.2)
    const handling = fallback ? allowance : Math.round(allowance + (outlet?.mall ? 8 : 0) + (order.brand === 'Tech' ? 6 : 0) + (order.temp === 'CHILLED' ? 4 : 0))
    const spread = mode === 'LOW_CONFIDENCE' ? 30 : 12
    const deadline = outlet ? (order.brand === 'Fresh' ? Math.min(480, outlet.window[1]) : outlet.window[1]) : null
    const probability = !fallback && plan && deadline !== null ? Math.max(.02, Math.min(.98, 1 / (1 + Math.exp((deadline - plan.eta - (outlet?.mall ? 8 : 0)) / spread)))) : null
    const reasons = [order.volumeM3 + ' m³ to unload', outlet?.mall ? 'Shared mall loading bay' : 'Standard outlet access', order.temp === 'CHILLED' ? 'Cold-chain handling checks' : order.brand === 'Tech' ? 'Fragile-item handling' : 'Ambient goods']
    if (!plan) reasons.push('Assign a route to estimate arrival risk')
    if (fallback) reasons.push(!online ? 'Offline: using the saved plan' : MODE_LABELS[mode])
    if (mode === 'LOW_CONFIDENCE') reasons.push('Scenario: limited comparable deliveries')
    return {
      orderId: order.id, tripId: plan?.tripId, serviceMin: handling,
      serviceRange: [Math.max(1, handling - (fallback ? 0 : 5)), handling + (fallback ? 0 : mode === 'LOW_CONFIDENCE' ? 18 : 8)],
      arrival: plan ? Math.round(plan.eta) : null,
      arrivalRange: plan ? [Math.max(0, Math.round(plan.eta - spread)), Math.round(plan.eta + spread)] : null,
      lateProbability: probability, confidence: fallback ? 'Fallback' : mode === 'LOW_CONFIDENCE' ? 'Low' : 'Illustrative',
      source: fallback ? 'Planning allowance' : 'Demo estimate', reasons,
      needsReview: fallback || mode === 'LOW_CONFIDENCE' || (probability ?? 0) >= .35,
    }
  })
}

export interface DemandWeek {
  key: string
  week: number
  year: number
  start: string
  total: number
  chilled: number
  ambient: number
  low: number
  high: number
}
export function forecastDemand(d: OpsData, depot: Depot, brand: Brand, uplift = 1): DemandWeek[] {
  const dates = new Set(d.orders.map((o) => o.deliveryDate)).size || 1
  const outlets = new Set(d.outlets.filter((o) => o.depot === depot).map((o) => o.id))
  // Count requested demand once, including deferred and undelivered orders.
  const orders = [...new Map(d.orders.map((o) => [o.id, o])).values()].filter((o) => o.brand === brand && outlets.has(o.outletId))
  const cadence = brand === 'Fresh' ? 6 : brand === 'Style' ? 1 : 3
  const volume = (list: Order[]) => list.reduce((sum, o) => sum + o.volumeM3, 0) / dates * cadence
  const baseline = volume(orders)
  const chilled = brand === 'Fresh' ? volume(orders.filter((o) => o.temp === 'CHILLED')) : 0
  const base = new Date(d.deliveryDate + 'T00:00:00Z')
  const monday = new Date(base)
  monday.setUTCDate(base.getUTCDate() + (8 - (base.getUTCDay() || 7)))
  return Array.from({ length: 10 }, (_, i) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + i * 7)
    const thursday = new Date(date)
    thursday.setUTCDate(date.getUTCDate() + 3)
    const year = thursday.getUTCFullYear()
    const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
    const total = Math.round(baseline * Math.max(.5, Math.min(2, uplift)))
    const cold = Math.min(total, Math.round(chilled * Math.max(.5, Math.min(2, uplift))))
    return { key: `${year}-W${String(week).padStart(2, '0')}`, week, year, start: date.toISOString().slice(0, 10), total, chilled: cold, ambient: total - cold, low: Math.round(total * .8), high: Math.round(total * 1.25) }
  })
}
