import { ArrowLeft, Check, CheckCircle2, CloudOff, MapPin, Phone, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PhotoCapture, SignaturePad } from '../../components/ProofCapture'
import { directionsUrl, LocationMap } from '../../components/RouteMap'
import { Badge, Button, Callout, Card, ChoiceList, EmptyState, Field, Input, Textarea, toast } from '../../components/ui'
import { fmtClock, fmtMin, fmtWindow } from '../../domain/time'
import type { DeliveryRecord } from '../../domain/types'
import { isDone, unitsOf } from '../../lib/select'
import { useDevice, useNetwork } from '../../store'
import { useDriverRoute } from './common'

type Outcome = DeliveryRecord['outcome']

export function Stop() {
  const { orderId } = useParams()
  const { trip, stops, vehicle } = useDriverRoute()
  const record = useDevice((s) => s.record)
  const net = useNetwork()
  const navigate = useNavigate()
  const [delivering, setDelivering] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [receiver, setReceiver] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string>()
  const [signature, setSignature] = useState<string>()
  const [itemsOk, setItemsOk] = useState(false)
  const [delivered, setDelivered] = useState<Record<string, number>>({})

  const idx = stops.findIndex((s) => s.order.id === orderId)
  const s = stops[idx]
  if (!trip || !s) return <EmptyState icon={<MapPin className="size-5" />} title="Stop not found on your route" action={<Link to="/driver/route">Back to route</Link>} />
  const { order: o, outlet, plan } = s
  const failed = outcome === 'REFUSED' || outcome === 'CLOSED' || outcome === 'NO_ACCESS'
  const nextStop = stops.slice(idx + 1).find((x) => !isDone(x.order))
  const paused = trip.status === 'PAUSED' || trip.status === 'ABORTED'
  const reassigned = o.tripId !== trip.id

  const arrive = () => {
    record({ type: 'ARRIVE', orderId: o.id, tripId: trip.id })
    toast(`Arrived at ${outlet.id}`, { tone: 'info', body: net.online ? 'Store notified.' : 'Saved on this device.' })
  }

  const complete = () => {
    const rec: DeliveryRecord = {
      outcome: outcome!,
      receiver: receiver.trim() || undefined,
      notes: [notes.trim(), outcome === 'PARTIAL' ? o.items.map((i) => `${i.name} ${delivered[i.name] ?? i.qty}/${i.qty}`).join(', ') : ''].filter(Boolean).join(' · ') || undefined,
      completedAt: Date.now(),
      arrivedAt: o.delivery?.arrivedAt,
      offline: !net.online || undefined,
    }
    record({ type: 'DELIVER', orderId: o.id, tripId: trip.id, record: rec })
    if (photo) record({ type: 'PROOF', orderId: o.id, photo })
    if (signature) record({ type: 'PROOF', orderId: o.id, signature })
    toast(failed ? 'Failed attempt recorded' : 'Delivery complete', { tone: failed ? 'attention' : 'success', body: net.online ? 'Synced.' : `Saved offline · ${1 + (photo ? 1 : 0) + (signature ? 1 : 0)} updates waiting` })
    setDelivering(false)
  }

  const canComplete = outcome && (failed ? true : receiver.trim() && itemsOk && (photo || signature))

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/driver/route" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Route
      </Link>
      <div className="eyebrow">Stop {idx + 1} of {stops.length}</div>
      <h1 className="id mt-1 text-4xl">{outlet.id}</h1>
      <p className="text-muted">{outlet.name} · {outlet.district}</p>

      {reassigned && <Callout tone="warning" title="This stop was reassigned" className="mt-4">The dispatcher moved it to another vehicle. Any delivery you already recorded is kept.</Callout>}

      {isDone(o) ? (
        <Card className="mt-6 p-6 text-center">
          <CheckCircle2 className={`mx-auto size-12 ${o.status === 'FAILED' ? 'text-attention' : 'text-success'}`} />
          <div className="mt-3 font-display text-xl font-semibold">{o.status === 'FAILED' ? 'Failed attempt recorded' : o.status === 'PARTIAL' ? 'Partial delivery recorded' : 'Delivered'}</div>
          <p className="mt-1 text-sm text-muted">
            {o.delivery?.completedAt && `at ${fmtClock(o.delivery.completedAt)}`} {o.delivery?.receiver && `· received by ${o.delivery.receiver}`}
          </p>
          {o.delivery?.offline && (
            <Badge tone="neutral" className="mt-3">
              <CloudOff className="size-3" /> Recorded offline
            </Badge>
          )}
          {nextStop && (
            <Link to={`/driver/stop/${nextStop.order.id}`} className="mt-6 block">
              <Button size="xl" block>
                Next stop · {nextStop.outlet.id}
              </Button>
            </Link>
          )}
          {!nextStop && (
            <Button size="xl" block className="mt-6" onClick={() => navigate('/driver')}>
              Finish
            </Button>
          )}
        </Card>
      ) : o.status !== 'ARRIVED' ? (
        <Card className="mt-6 p-5">
          <div className="grid grid-cols-3 gap-3">
            <Info label="ETA" value={fmtMin(plan.start)} />
            <Info label="Window" value={fmtWindow(outlet.window)} />
            <Info label="Items" value={`${unitsOf(o)}`} />
          </div>
          <LocationMap outlet={outlet} depot={vehicle.depot} className="mt-4 h-44" />
          <a href={directionsUrl(outlet)} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-brand-ink underline">
            Directions on OpenStreetMap
          </a>
          {o.brand === 'Fresh' && (
            <p className="mt-3 rounded-lg bg-attention-soft px-3 py-2 text-sm font-semibold text-attention-ink">Fresh delivery · must be received before 08:00</p>
          )}
          {plan.late && <WindowClosed windowEnd={outlet.window[1]} />}
          <Button size="xl" block className="mt-5" disabled={paused || trip.status !== 'IN_PROGRESS'} onClick={arrive}>
            I’ve arrived
          </Button>
          {trip.status !== 'IN_PROGRESS' && !paused && <p className="mt-2 text-center text-xs text-muted">Start your route first.</p>}
        </Card>
      ) : !delivering ? (
        <Card className="mt-6 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Arrived" value={o.delivery?.arrivedAt ? fmtClock(o.delivery.arrivedAt) : '—'} />
            <Info label="Window closes" value={fmtMin(outlet.window[1])} />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 p-4">
            <span className="text-sm text-muted">Status</span>
            {plan.late ? <Badge tone="attention">Late</Badge> : <span className="inline-flex items-center gap-1 font-semibold text-success-ink">On time <Check className="size-4" strokeWidth={3} /></span>}
          </div>
          {plan.late && <WindowClosed windowEnd={outlet.window[1]} />}
          <Button size="xl" block className="mt-5" onClick={() => setDelivering(true)}>
            Begin delivery
          </Button>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="p-5">
            <div className="eyebrow mb-3">Delivery outcome</div>
            <ChoiceList
              name="Delivery outcome"
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: 'DELIVERED', label: 'Delivered in full' },
                { value: 'PARTIAL', label: 'Partial delivery' },
                { value: 'REFUSED', label: 'Refused' },
                { value: 'CLOSED', label: 'Outlet closed', hint: 'Receiving team absent' },
                { value: 'NO_ACCESS', label: 'Unable to access', hint: outlet.mall ? 'Mall security / bay unavailable' : 'Access blocked' },
              ]}
            />
          </Card>

          {outcome && !failed && (
            <Card className="p-5">
              <div className="eyebrow mb-3">Items</div>
              <ul className="divide-y divide-line text-sm">
                {o.items.map((i) => (
                  <li key={i.name} className="flex items-center justify-between py-2.5">
                    <span>{i.name}</span>
                    {outcome === 'PARTIAL' ? (
                      <span className="flex items-center gap-2">
                        <input inputMode="numeric" className="h-10 w-14 rounded-lg border border-line-strong bg-surface text-center" value={delivered[i.name] ?? i.qty} onChange={(e) => setDelivered((x) => ({ ...x, [i.name]: Math.min(i.qty, Number(e.target.value.replace(/\D/g, '')) || 0) }))} aria-label={`${i.name} delivered`} />
                        <span className="text-muted">/ {i.qty}</span>
                      </span>
                    ) : (
                      <span className="tabular-nums text-muted">
                        {i.qty} {i.unit}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button variant={itemsOk ? 'secondary' : 'primary'} block className="mt-3" icon={itemsOk ? <Check className="size-4" /> : undefined} onClick={() => setItemsOk(true)}>
                {itemsOk ? 'Items confirmed' : 'Confirm items'}
              </Button>
            </Card>
          )}

          {outcome && (
            <Card className="space-y-4 p-5">
              {!failed && <Field label="Receiver name">{(id) => <Input id={id} value={receiver} onChange={(e) => setReceiver(e.target.value)} autoComplete="off" />}</Field>}
              <div>
                <div className="mb-2 text-sm font-medium">{failed ? 'Photo of the outlet' : 'Proof photo'}</div>
                <PhotoCapture value={photo} onChange={setPhoto} />
              </div>
              {!failed && (
                <div>
                  <div className="mb-2 text-sm font-medium">Signature</div>
                  <SignaturePad value={signature} onChange={setSignature} />
                </div>
              )}
              <Field label="Notes">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
              {!failed && !(photo || signature) && <p className="text-xs text-muted">A photo or signature is required as proof of delivery.</p>}
            </Card>
          )}

          <Button size="xl" block variant={failed ? 'attention' : 'primary'} disabled={!canComplete} onClick={complete}>
            {failed ? 'Record failed attempt' : 'Complete delivery'}
          </Button>
          {!net.online && <p className="text-center text-xs text-muted">You’re offline — this will be saved on the device and synced automatically.</p>}
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function WindowClosed({ windowEnd }: { windowEnd: number }) {
  return (
    <Callout tone="warning" icon={<TriangleAlert className="size-5" />} title="Delivery window closed" className="mt-4" action={<a href="tel:+94110000000"><Button size="sm" variant="secondary" icon={<Phone className="size-4" />}>Contact store</Button></a>}>
      Window closed at {fmtMin(windowEnd)}. Continue only if the outlet agrees to receive the delivery.
    </Callout>
  )
}
