import { useMemo } from 'react'
import { driverTrip, isDone, orderOf, scheduleOf } from '../../lib/select'
import { useSession, useView } from '../../store'

/** Everything the driver screens need, derived from this device's view of the operation. */
export function useDriverRoute() {
  const d = useView()
  const user = useSession((s) => s.user)!
  return useMemo(() => {
    const trip = driverTrip(d, user.assignedVehicle)
    const vehicle = d.vehicles.find((v) => v.id === user.assignedVehicle)!
    if (!trip) return { d, vehicle, trip: undefined, sched: undefined, stops: [], nextIdx: -1, done: 0 }
    const sched = scheduleOf(d, trip)
    const stops = trip.stops.map((id, i) => ({ order: orderOf(d, id)!, plan: sched.stops[i], outlet: d.outlets.find((o) => o.id === orderOf(d, id)!.outletId)! }))
    const nextIdx = stops.findIndex((s) => !isDone(s.order))
    return { d, vehicle, trip, sched, stops, nextIdx, done: stops.filter((s) => isDone(s.order)).length }
  }, [d, user.assignedVehicle])
}
