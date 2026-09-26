import assert from 'node:assert/strict'
import test from 'node:test'
import { forecastDemand, predictStops } from '../src/domain/intelligence'
import { seedOps, commands, applyEvent } from '../src/store/events'

function planned() {
  const d = seedOps()
  commands.closeOrders(d)
  commands.generatePlan(d)
  commands.publishPlan(d)
  return d
}

test('all six depot/brand cohorts have valid ten-week volume totals', () => {
  const d = seedOps()
  for (const depot of ['Peliyagoda', 'Kandy'] as const) for (const brand of ['Fresh', 'Style', 'Tech'] as const) {
    const rows = forecastDemand(d, depot, brand)
    assert.equal(rows.length, 10)
    assert.equal(new Set(rows.map((r) => r.key)).size, 10)
    for (const r of rows) {
      assert.equal(r.chilled + r.ambient, r.total)
      assert.ok(r.low <= r.total && r.high >= r.total)
      if (brand !== 'Fresh') assert.equal(r.chilled, 0)
      assert.equal(new Date(r.start).getUTCDay(), 1)
    }
  }
})

test('forecast counts deferred demand once and isolates depots', () => {
  const d = seedOps()
  const before = forecastDemand(d, 'Peliyagoda', 'Fresh')[0].total
  d.orders.forEach((o) => { o.status = 'DEFERRED' })
  d.orders.push(structuredClone(d.orders[0]))
  assert.equal(forecastDemand(d, 'Peliyagoda', 'Fresh')[0].total, before)
  const other = d.outlets.find((o) => o.depot === 'Kandy' && o.brand === 'Fresh')!
  d.orders.push({ ...structuredClone(d.orders[0]), id: 'NEW-KANDY', outletId: other.id, brand: 'Fresh', volumeM3: 100 })
  assert.equal(forecastDemand(d, 'Peliyagoda', 'Fresh')[0].total, before)
})

test('ISO forecast periods roll over years without invalid week numbers', () => {
  const d = seedOps()
  d.deliveryDate = '2026-12-27'
  const rows = forecastDemand(d, 'Peliyagoda', 'Fresh')
  assert.equal(rows[0].key, '2026-W53')
  assert.equal(rows[1].key, '2027-W01')
  assert.equal(rows[0].start, '2026-12-28')
})

test('missing, stale and offline predictions never expose risk probabilities', () => {
  const d = planned()
  const normal = predictStops(d)
  assert.ok(normal.some((p) => p.lateProbability !== null))
  for (const mode of ['UNAVAILABLE', 'STALE'] as const) {
    assert.ok(predictStops(d, mode).every((p) => p.lateProbability === null && p.source === 'Planning allowance'))
  }
  assert.ok(predictStops(d, 'READY', false).every((p) => p.lateProbability === null))
  assert.ok(normal.every((p) => p.serviceMin > 0 && (p.lateProbability === null || p.lateProbability >= 0 && p.lateProbability <= 1)))
  assert.ok(predictStops(d, 'LOW_CONFIDENCE').every((p) => p.needsReview && p.confidence === 'Low'))
})

test('reviews and capacity proposals leave routes unchanged and retain audit evidence', () => {
  const d = planned()
  const routes = JSON.stringify(d.trips)
  commands.reviewPrediction(d, d.orders[0].id, 'Check the receiving window before release')
  commands.capacityProposal(d, { depot: 'Kandy', brand: 'Fresh', week: '2027-W01', extraVehicles: 2, refrigerated: true, note: 'Peak scenario, pending approval' })
  assert.equal(d.intelligence?.reviews.length, 1)
  assert.equal(d.intelligence?.capacityPlans.length, 1)
  assert.equal(JSON.stringify(d.trips), routes)
  assert.ok(d.audit.some((a) => a.entity === 'CAPACITY'))
  commands.capacityProposal(d, { depot: 'Kandy', brand: 'Fresh', week: '2027-W01', extraVehicles: -1, refrigerated: true, note: 'Invalid' })
  assert.equal(d.intelligence?.capacityPlans.length, 1)
})

test('loading shortfall blocks dispatch until resolved, then driver delivery reaches receipt', () => {
  const d = planned()
  const trip = d.trips.find((t) => t.stops.length)!
  const o = d.orders.find((o) => o.id === trip.stops[0])!
  const event = (event: Parameters<typeof applyEvent>[1]['event'], actor: 'LOADER' | 'DRIVER' = 'LOADER') => applyEvent(d, { event, actor, at: Date.now() })
  event({ type: 'START_ROUTE', tripId: trip.id }, 'DRIVER')
  assert.equal(trip.status, 'PLANNED')
  event({ type: 'LOAD_START', tripId: trip.id })
  for (const id of trip.stops) {
    const order = d.orders.find((o) => o.id === id)!
    for (const item of order.items) event({ type: 'LOAD_COUNT', orderId: id, item: item.name, count: item.qty })
  }
  event({ type: 'SHORTFALL', orderId: o.id, item: o.items[0].name, missing: 1, reason: 'Damaged at dock' })
  event({ type: 'LOAD_COMPLETE', tripId: trip.id })
  assert.equal(trip.status, 'LOADING')
  const issue = d.issues.find((i) => i.kind === 'SHORTFALL' && i.orderIds?.includes(o.id))!
  commands.resolveIssue(d, issue.id, 'Deliver available quantity')
  event({ type: 'LOAD_COMPLETE', tripId: trip.id })
  assert.equal(trip.status, 'LOADED')
  event({ type: 'START_ROUTE', tripId: trip.id }, 'DRIVER')
  event({ type: 'ARRIVE', orderId: o.id, tripId: trip.id }, 'DRIVER')
  event({ type: 'DELIVER', orderId: o.id, tripId: trip.id, record: { outcome: 'PARTIAL', receiver: 'Store manager', notes: 'One damaged item', signature: 'test-proof', offline: true } }, 'DRIVER')
  assert.equal(o.status, 'PARTIAL')
  commands.confirmReceipt(d, o.id, { received: 1, condition: 'MISSING', receiver: 'Store manager' })
  assert.equal(o.status, 'RECEIVED')
  assert.ok(d.issues.some((i) => i.kind === 'STORE_ISSUE' && i.orderIds?.includes(o.id)))
})

test('Sri Lanka cutoff routes late orders to the following operating run and skips Sunday', async () => {
  const { orderCutoff, nextOperatingDate, isoDay } = await import('../src/domain/time')
  assert.equal(orderCutoff(new Date('2026-09-25T10:29:00Z')).deliveryDate, '2026-09-26')
  assert.equal(orderCutoff(new Date('2026-09-25T10:30:00Z')).deliveryDate, '2026-09-28')
  assert.equal(orderCutoff(new Date('2026-09-26T10:29:00Z')).deliveryDate, '2026-09-28')
  assert.equal(orderCutoff(new Date('2026-09-26T10:30:00Z')).deliveryDate, '2026-09-29')
  assert.equal(nextOperatingDate('2026-09-26'), '2026-09-28')
  assert.equal(isoDay(0, new Date('2026-09-25T20:00:00Z')), '2026-09-26')
})

test('manual allocation cannot mix brands within one vehicle trip', async () => {
  const { validate, departureFor } = await import('../src/domain/rules')
  const d = seedOps()
  const style = d.orders.find((o) => o.brand === 'Style')!
  const outlet = d.outlets.find((o) => o.id === style.outletId)!
  const vehicle = d.vehicles.find((v) => v.depot === outlet.depot && v.status === 'AVAILABLE')!
  d.trips.push({ id: 'MIX-CHECK', vehicleId: vehicle.id, number: 2, brand: 'Tech', district: outlet.district, departure: departureFor('Tech'), stops: [], status: 'DRAFT' })
  const result = validate(style, vehicle, d)
  assert.equal(result.checks.find((c) => c.key === 'brand')?.ok, false)
  assert.equal(result.ok, false)
})
