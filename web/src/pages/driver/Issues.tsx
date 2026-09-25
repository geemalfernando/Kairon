import { MapPin, ShieldAlert, Snowflake } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Callout, Card, ChoiceList, EmptyState, Field, SeverityBadge, Textarea, toast } from '../../components/ui'
import { timeAgo } from '../../domain/time'
import { isDone } from '../../lib/select'
import { useDevice, useNetwork } from '../../store'
import { useDriverRoute } from './common'

const KINDS = ['Breakdown', 'Flat tyre', 'Engine warning', 'Refrigeration failure', 'Accident', 'Other'] as const

export function Issues() {
  const { d, trip, vehicle, stops } = useDriverRoute()
  const record = useDevice((s) => s.record)
  const net = useNetwork()
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null)
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')
  const remaining = stops.filter((s) => !isDone(s.order))
  const chilled = remaining.filter((s) => s.order.temp === 'CHILLED')
  const history = d.issues.filter((i) => i.vehicleId === vehicle.id)
  const active = history.find((i) => !i.resolved && (i.kind === 'BREAKDOWN' || i.kind === 'REEFER_FAILURE'))

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-bold">Vehicle issue</h1>
      <p className="text-sm text-muted">Report anything that stops you delivering safely.</p>

      {active || trip?.status === 'PAUSED' ? (
        <Card className="mt-6 p-6">
          <div className="flex items-center gap-2 text-critical-ink">
            <ShieldAlert className="size-6" />
            <span className="font-display text-xl font-bold uppercase">Breakdown reported</span>
          </div>
          <ul className="mt-4 space-y-2 text-[15px]">
            <li>✓ Dispatcher {net.online ? 'notified' : 'will be notified when you’re back online'}.</li>
            <li className="font-semibold">Remain safely stopped.</li>
            <li>Current route: <Badge tone="critical">Paused</Badge></li>
            <li>{remaining.length} deliveries awaiting reassignment.</li>
          </ul>
        </Card>
      ) : !trip || !['LOADED', 'IN_PROGRESS'].includes(trip.status) ? (
        <Card className="mt-6">
          <EmptyState icon={<ShieldAlert className="size-5" />} title="No active route" body="Vehicle issues can be reported once your route is loaded." />
        </Card>
      ) : step === 'pick' ? (
        <Card className="mt-6 space-y-4 p-5">
          <ChoiceList name="Issue type" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: k }))} />
          <Field label="Details (optional)">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Button size="xl" block variant="danger" disabled={!kind} onClick={() => setStep('confirm')}>
            Continue
          </Button>
        </Card>
      ) : (
        <Card className="mt-6 space-y-4 p-5">
          {kind === 'Refrigeration failure' && chilled.length > 0 && (
            <Callout tone="critical" icon={<Snowflake className="size-5" />} title="Refrigeration failure — chilled deliveries onboard">
              {chilled.map((s) => s.outlet.id).join(', ')}. Avoid continuing delivery until the dispatcher confirms recovery.
            </Callout>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-muted">Vehicle</dt>
              <dd className="id text-lg">{vehicle.id}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-muted">Issue</dt>
              <dd className="font-semibold">{kind}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-muted">Remaining deliveries</dt>
              <dd className="font-display text-lg font-semibold">{remaining.length}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <dt className="text-xs text-muted">Refrigerated goods</dt>
              <dd className="font-semibold">{chilled.length ? 'YES' : 'No'}</dd>
            </div>
          </dl>
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4" /> Current location recorded
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="xl" onClick={() => setStep('pick')}>
              Back
            </Button>
            <Button
              size="xl"
              variant="danger"
              onClick={() => {
                record({ type: 'VEHICLE_ISSUE', vehicleId: vehicle.id, tripId: trip.id, kind: kind!, note: note.trim() || undefined })
                toast('Breakdown reported', { tone: 'critical', body: net.online ? 'Dispatcher notified.' : 'Saved offline — sends when signal returns.' })
                setStep('pick')
                setKind(null)
              }}
            >
              Report {kind === 'Refrigeration failure' ? 'failure' : 'breakdown'}
            </Button>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold">Recent</h2>
          <Card className="divide-y divide-line">
            {history.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-5 py-3">
                <SeverityBadge s={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{i.title}</div>
                  <div className="text-xs text-muted">{i.resolved ? i.resolved.decision : i.detail}</div>
                </div>
                <span className="text-xs text-faint">{timeAgo(i.createdAt)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
