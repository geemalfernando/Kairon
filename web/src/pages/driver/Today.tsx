import { Check, CloudDownload, Navigation, ShieldAlert, Snowflake, Truck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Callout, Card, CheckRow, EmptyState, toast } from '../../components/ui'
import { isReefer, vehicleLabel } from '../../domain/seed'
import { fmtClock, fmtMin, greeting } from '../../domain/time'
import { useDevice, useNetwork, useSession } from '../../store'
import { useDriverRoute } from './common'

export function Today() {
  const user = useSession((s) => s.user)!
  const { d, trip, vehicle, sched, stops, nextIdx, done } = useDriverRoute()
  const record = useDevice((s) => s.record)
  const net = useNetwork()
  const navigate = useNavigate()
  const openIssue = d.issues.find((i) => i.vehicleId === vehicle.id && !i.resolved && (i.kind === 'BREAKDOWN' || i.kind === 'REEFER_FAILURE'))

  return (
    <div className="mx-auto max-w-xl">
      <div className="eyebrow">{greeting()}, {user.name}</div>
      <div className="mt-1 flex items-center gap-2">
        <h1 className="id text-3xl">{vehicle.id}</h1>
        {isReefer(vehicle.type) && <Snowflake className="size-5 text-info" />}
      </div>
      <p className="text-sm text-muted">{vehicleLabel(vehicle.type)} · {vehicle.depot}</p>

      {!trip ? (
        <Card className="mt-6">
          <EmptyState icon={<Truck className="size-5" />} title="No route assigned yet" body="Your route appears here once the dispatcher publishes the plan and the loader prepares your vehicle." />
        </Card>
      ) : (
        <>
          <Card className="mt-6 overflow-hidden">
            <div className="bg-teal p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Today’s route</div>
              <div className="mt-1 font-display text-2xl font-semibold">
                Trip {trip.number} · {trip.brand} · {trip.district}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-white/60">Stops</div>
                  <div className="font-display text-xl font-semibold">{stops.length}</div>
                </div>
                <div>
                  <div className="text-white/60">Departure</div>
                  <div className="font-display text-xl font-semibold">{fmtMin(trip.departure)}</div>
                </div>
                <div>
                  <div className="text-white/60">Finish</div>
                  <div className="font-display text-xl font-semibold">{sched ? fmtMin(sched.finish) : '—'}</div>
                </div>
              </div>
            </div>
            <div className="p-5">
              {trip.status === 'PAUSED' || openIssue ? (
                <Callout tone="critical" icon={<ShieldAlert className="size-5" />} title="Breakdown reported · route paused">
                  Dispatcher notified. Remain safely stopped. {stops.length - done} deliveries awaiting reassignment.
                </Callout>
              ) : trip.status === 'IN_PROGRESS' ? (
                <>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-semibold">
                      {done} / {stops.length} complete
                    </span>
                    {nextIdx >= 0 && <span className="text-muted">Next: <span className="id">{stops[nextIdx].outlet.id}</span> · ETA {fmtMin(stops[nextIdx].plan.start)}</span>}
                  </div>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / stops.length) * 100}%` }} />
                  </div>
                  <Link to="/driver/route">
                    <Button size="xl" block icon={<Navigation className="size-5" />}>
                      Continue route
                    </Button>
                  </Link>
                </>
              ) : trip.status === 'COMPLETED' ? (
                <Callout tone="success" icon={<Check className="size-5" />} title="Route complete">
                  All {stops.length} stops recorded. Return safely to {vehicle.depot}.
                </Callout>
              ) : trip.status === 'LOADED' ? (
                <Button
                  size="xl"
                  block
                  icon={<Navigation className="size-5" />}
                  onClick={() => {
                    record({ type: 'START_ROUTE', tripId: trip.id })
                    toast('Route started', { body: net.online ? 'Stores notified you’re on the way.' : 'Saved offline — will sync.' })
                    navigate('/driver/route')
                  }}
                >
                  Start route
                </Button>
              ) : (
                <Callout tone="info" icon={<Truck className="size-5" />} title={trip.status === 'LOADING' ? 'Vehicle is being loaded' : 'Waiting for loading'}>
                  You can start the route once the loader confirms every stop.
                </Callout>
              )}
            </div>
          </Card>

          <Card className="mt-4 p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <CloudDownload className="size-4 text-brand" /> Offline readiness
              </div>
              <Badge tone="success">Available offline ✓</Badge>
            </div>
            <CheckRow ok label="Today’s route" detail={`${stops.length} stops`} />
            <CheckRow ok label="Orders" detail="Downloaded" />
            <CheckRow ok label="Outlet details" detail="Downloaded" />
            <CheckRow ok label="Delivery windows" detail="Downloaded" />
            <CheckRow ok label="Proof capture" detail="Ready" />
            <p className="mt-2 text-xs text-muted">Last sync {net.lastSync ? fmtClock(net.lastSync) : 'at sign-in'} · you can keep working if the signal drops.</p>
          </Card>

          {['LOADED', 'IN_PROGRESS'].includes(trip.status) && (
            <Link to="/driver/issues" className="mt-4 block">
              <Button variant="secondary" block size="lg" icon={<ShieldAlert className="size-5" />}>
                Report vehicle issue
              </Button>
            </Link>
          )}
        </>
      )}
    </div>
  )
}
