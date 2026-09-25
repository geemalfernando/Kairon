import { Ban, Snowflake, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { AuditTimeline } from '../../components/AuditTimeline'
import { LocationMap } from '../../components/RouteMap'
import { Badge, Button, CheckRow, ChoiceList, cn, Field, IconButton, Modal, StatusBadge, Textarea, toast } from '../../components/ui'
import { customerMessageFor, suggestVehicles, validate, type Validation } from '../../domain/rules'
import { vehicleLabel } from '../../domain/seed'
import { fmtWindow } from '../../domain/time'
import type { Order } from '../../domain/types'
import { auditFor, outletOf, tripOf } from '../../lib/select'
import { ops, useOps } from '../../store'

const REASONS = ['Capacity exhausted', 'Required vehicle unavailable', 'Access restriction', 'Time-window conflict', 'Fresh 08:00 deadline', 'Fuel quota', 'Other'] as const

export function DeferModal({ order, open, onClose }: { order?: Order; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  if (!order) return null
  const pick = (r: (typeof REASONS)[number]) => {
    setReason(r)
    setMessage(`Your delivery has been rescheduled because ${customerMessageFor(r).charAt(0).toLowerCase()}${customerMessageFor(r).slice(1)}`)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`Order ${order.id} · ${order.outletId}`}
      title="Confirm deferral"
      tone="attention"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="attention"
            disabled={!reason || !message.trim()}
            onClick={() => {
              ops('defer', order.id, reason!, message.trim(), note.trim() || undefined)
              toast(`${order.id} deferred`, { tone: 'attention', body: 'The store has been notified with your explanation.' })
              onClose()
            }}
          >
            Confirm deferral
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-medium">Reason</div>
          <ChoiceList name="Deferral reason" columns={2} value={reason} onChange={pick} options={REASONS.map((r) => ({ value: r, label: r }))} />
        </div>
        <Field label="Customer-facing explanation" hint="The store manager sees exactly this text.">
          {(id) => <Textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your delivery has been rescheduled because…" />}
        </Field>
        <Field label="Internal note">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />}</Field>
      </div>
    </Modal>
  )
}

/** Friendly headline for the first blocking constraint, matching the degradation language. */
export function blockedHeadline(v: Validation, order: Order, vehicleId: string, vehicleType: string) {
  const first = v.checks.find((c) => c.blocking && !c.ok)!
  switch (first.key) {
    case 'access':
      return { title: `${order.outletId} is VAN ONLY`, body: `${vehicleId} is a ${vehicleType.toLowerCase()}. This allocation cannot be saved.`, icon: Truck }
    case 'temperature':
      return { title: `${order.outletId} contains chilled goods`, body: `Required: REEFER · Selected: ${vehicleType.toUpperCase()}. Choose another vehicle.`, icon: Snowflake }
    case 'volume':
    case 'weight':
      return { title: 'Capacity exceeded', body: `${vehicleId} · ${first.label}: ${first.detail}. Remove a stop or select another vehicle.`, icon: Ban }
    case 'fresh':
      return { title: 'Fresh 08:00 deadline', body: `${first.detail}. Fresh stores must receive their delivery before 08:00 — choose a closer trip or another vehicle.`, icon: Ban }
    case 'trips':
      return { title: 'Trip limit reached', body: `${vehicleId} has already made its 2 trips today. A vehicle can only do 2 delivery trips a day.`, icon: Truck }
    case 'turnaround':
      return { title: 'Vehicle still on Trip 1', body: `${first.detail}. Trip 2 can only leave after Trip 1 is back at the depot.`, icon: Truck }
    case 'fuel':
      return { title: 'Fuel quota risk', body: `Adding this route projects ${first.detail}. This allocation exceeds the weekly quota.`, icon: Ban }
    default:
      return { title: 'Cannot assign order', body: `${first.label}: ${first.detail}`, icon: Ban }
  }
}

export function BlockedModal({ state, onClose, onPick }: { state: { order: Order; vehicleId: string; v: Validation } | null; onClose: () => void; onPick: (vehicleId: string) => void }) {
  const d = useOps((s) => s.data)
  if (!state) return null
  const vehicle = d.vehicles.find((v) => v.id === state.vehicleId)!
  const h = blockedHeadline(state.v, state.order, vehicle.id, vehicleLabel(vehicle.type))
  const suggestions = suggestVehicles(state.order, d, vehicle.id)
  return (
    <Modal open onClose={onClose} eyebrow="Blocked" title={h.title} tone="critical" footer={<Button variant="secondary" onClick={onClose}>Choose another vehicle</Button>}>
      <p className="text-sm">{h.body}</p>
      <p className="mt-1 text-xs text-muted">No “continue anyway”: hard constraints can’t be overridden.</p>
      <div className="mt-4 rounded-xl border border-line p-3">
        {state.v.checks.map((c) => (
          <CheckRow key={c.key} ok={c.ok} warn={!c.blocking} label={c.label} detail={c.detail} />
        ))}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow mb-2">Suggested</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => onPick(s.id)} className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-left text-sm hover:border-brand">
                <span className="id block text-brand-ink">{s.id}</span>
                <span className="text-xs text-muted">{vehicleLabel(s.type)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Try an allocation; returns the validation so callers can show success or the blocked dialog. */
export function tryAssign(order: Order, vehicleId: string) {
  const d = useOps.getState().data
  const v = d.vehicles.find((x) => x.id === vehicleId)!
  const pre = validate(order, v, d)
  if (!pre.ok) return pre
  const r = ops('assign', order.id, vehicleId)
  if (r.ok) {
    const vol = r.checks.find((c) => c.key === 'volume')!.detail
    const kg = r.checks.find((c) => c.key === 'weight')!.detail
    toast(`${order.outletId} assigned to ${vehicleId}`, { body: `Volume ${vol} · Weight ${kg}` })
  }
  return r
}

export function OrderDrawer({ order, onClose, onDefer }: { order?: Order; onClose: () => void; onDefer: (o: Order) => void }) {
  const d = useOps((s) => s.data)
  const [allocating, setAllocating] = useState(false)
  const [blocked, setBlocked] = useState<{ order: Order; vehicleId: string; v: Validation } | null>(null)
  if (!order) return null
  const o = d.orders.find((x) => x.id === order.id) ?? order
  const out = outletOf(d, o.outletId)!
  const trip = tripOf(d, o.tripId)
  const suggestions = allocating ? suggestVehicles(o, d, undefined, 5) : []
  const assign = (vid: string) => {
    const r = tryAssign(o, vid)
    if (!r.ok) setBlocked({ order: o, vehicleId: vid, v: r })
    else setAllocating(false)
  }
  const canAct = !['DELIVERED', 'RECEIVED', 'IN_TRANSIT', 'ARRIVED', 'PARTIAL', 'FAILED'].includes(o.status)
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={`Order ${o.id}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-lg animate-rise flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <div className="eyebrow mb-1">Order details</div>
            <h2 className="flex items-center gap-3 text-xl font-semibold">
              <span className="id">{o.id}</span> <StatusBadge s={o.status} />
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {out.name} · <span className="id">{out.id}</span>
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ['Brand', o.brand],
              ['Temperature', o.temp === 'CHILLED' ? 'Chilled' : 'Ambient'],
              ['Volume', `${o.volumeM3} m³`],
              ['Weight', `${o.weightKg} kg`],
              ['Access', out.vanOnly ? 'Van only' : out.mall ? 'Mall bay' : 'Any vehicle'],
              ['Window', fmtWindow(out.window)],
              ['District', out.district],
              ['Priority', o.priority],
              ['Vehicle', trip ? `${trip.vehicleId} · Trip ${trip.number}` : '—'],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="eyebrow mb-2">Items</div>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {o.items.map((i) => (
                <li key={i.name} className="flex justify-between px-3 py-2">
                  {i.name}
                  <span className="tabular-nums text-muted">
                    {i.qty} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <LocationMap outlet={out} depot={out.depot} vehicle={o.status === 'IN_TRANSIT' ? trip?.vehicleId : undefined} className="h-48" />
          <div>
            <div className="eyebrow mb-2">Service history</div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>Last delivery {out.lastServedDaysAgo} d ago</Badge>
              <Badge tone={out.deferralsThisWeek ? 'attention' : 'neutral'}>{out.deferralsThisWeek} deferrals this week</Badge>
            </div>
          </div>
          {o.deferral && (
            <div className="rounded-xl border border-attention/40 bg-attention-soft p-4 text-sm">
              <div className="font-semibold text-attention-ink">{o.deferral.confirmed ? 'Deferred' : 'Proposed deferral'} · {o.deferral.reason}</div>
              <p className="mt-1">{o.deferral.customerMessage}</p>
              <p className="mt-1 text-xs text-muted">Next recommended: {o.deferral.nextRecommendation}</p>
            </div>
          )}
          {allocating && (
            <div>
              <div className="eyebrow mb-2">Feasible vehicles</div>
              {suggestions.length === 0 && <p className="text-sm text-muted">No vehicle can take this order without breaking a constraint.</p>}
              <div className="grid gap-2">
                {suggestions.map((v) => (
                  <button key={v.id} onClick={() => assign(v.id)} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-sm hover:border-brand hover:bg-brand-soft">
                    <span>
                      <span className="id">{v.id}</span> <span className="text-muted">· {vehicleLabel(v.type)} · {v.driver}</span>
                    </span>
                    <span className="text-xs font-semibold text-brand-ink">Assign</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="eyebrow mb-3">Audit trail</div>
            <AuditTimeline events={auditFor(d, o.id)} />
          </div>
        </div>
        {canAct && (
          <div className={cn('flex gap-2 border-t border-line bg-surface-2/60 px-6 py-4')}>
            <Button onClick={() => setAllocating((a) => !a)} className="flex-1">
              {o.tripId ? 'Reallocate' : 'Allocate'}
            </Button>
            {o.status !== 'DEFERRED' || !o.deferral?.confirmed ? (
              <Button variant="secondary" className="flex-1" onClick={() => onDefer(o)}>
                Defer
              </Button>
            ) : null}
          </div>
        )}
      </aside>
      <BlockedModal state={blocked} onClose={() => setBlocked(null)} onPick={(vid) => (setBlocked(null), assign(vid))} />
    </div>
  )
}
