import { ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { byId } from '../../domain/rules'
import { useDevice, useOps } from '../../store'
import { Button, Callout, Modal } from '../ui'

/** Shown after reconnecting when the dispatcher changed this driver's route meanwhile. */
export function ConflictModal() {
  const conflict = useDevice((s) => s.conflict)
  const discard = useDevice((s) => s.discardConflict)
  const d = useOps((s) => s.data)
  const navigate = useNavigate()
  if (!conflict) return null
  const out = (id: string) => byId(d.outlets, byId(d.orders, id)?.outletId)?.id ?? id
  const where = (id: string) => byId(d.trips, byId(d.orders, id)?.tripId)?.vehicleId
  return (
    <Modal
      open
      onClose={discard}
      eyebrow="While you were offline"
      title="Route updated"
      tone="warning"
      footer={
        <Button
          onClick={() => {
            discard()
            navigate('/driver/route')
          }}
        >
          Review changes
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="eyebrow mb-2">Your offline route</div>
          <ul className="space-y-1.5">
            {conflict.offline.map((id) => (
              <li key={id} className={conflict.reassigned.includes(id) ? 'id text-attention-ink line-through decoration-2' : 'id'}>
                {out(id)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-2">Latest dispatcher route</div>
          <ul className="space-y-1.5">
            {conflict.latest.map((id) => (
              <li key={id} className="id">
                {out(id)}
              </li>
            ))}
            {conflict.latest.length === 0 && <li className="text-sm text-muted">No remaining stops</li>}
          </ul>
        </div>
      </div>
      {conflict.reassigned.length > 0 && (
        <p className="mt-4 text-sm">
          {conflict.reassigned.map((id) => (
            <span key={id} className="block">
              <b className="id">{out(id)}</b> {conflict.deliveredOffline.includes(id) ? 'was delivered by you offline — your delivery record was kept.' : where(id) ? `has been reassigned to ${where(id)}.` : 'has been rescheduled.'}
            </span>
          ))}
        </p>
      )}
      <Callout tone="success" icon={<ShieldCheck className="size-5" />} title="Your completed records were NOT deleted." className="mt-4">
        Every delivery you recorded offline has been synchronized.
      </Callout>
    </Modal>
  )
}
