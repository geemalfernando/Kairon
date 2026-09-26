import { BadgeCheck, CloudRain } from 'lucide-react'
import { lkr } from '../domain/incidents/sim'
import { timeAgo } from '../domain/time'
import type { OpsData } from '../store/events'
import { Callout } from './ui'

/**
 * What the incident desk has already done for this store — shown before the
 * store has to ask: zone-wide delay notices and credits applied automatically.
 */
export function StoreDeskNotes({ d, outletId, orderId }: { d: OpsData; outletId: string; orderId?: string }) {
  const desk = d.desk
  if (!desk) return null
  const notice = desk.notices.find((n) => n.outletIds.includes(outletId) && (!orderId || n.orderIds.includes(orderId)))
  const credits = desk.credits.filter((c) => c.caseId && c.outletId === outletId && (!orderId || c.orderId === orderId))
  if (!notice && !credits.length) return null
  return (
    <div className="space-y-3">
      {notice && (
        <Callout tone="warning" icon={<CloudRain className="size-5" />} title={`Deliveries in ${notice.district} are running about ${notice.delayMin} min late`}>
          {notice.cause}. We told every store in the area at once, so there is no need to call. Your driver is on the way.
        </Callout>
      )}
      {credits.map((c) => (
        <Callout key={c.id} tone="success" icon={<BadgeCheck className="size-5" />} title={`${lkr(c.amount)} credited${c.orderId ? ` for ${c.orderId}` : ''}`}>
          {c.reason} Applied automatically {timeAgo(c.at)} — nothing for you to claim.
        </Callout>
      ))}
    </div>
  )
}
