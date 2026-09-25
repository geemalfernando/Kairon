import { Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, PageHeader, StatusBadge, Timeline } from '../../components/ui'
import { storeOrders } from '../../lib/select'
import { useSession, useView } from '../../store'
import { deliveryTimeline, OrderSummary } from './shared'

export function Deliveries() {
  const d = useView()
  const user = useSession((s) => s.user)!
  const list = storeOrders(d, user.assignedOutlet).filter((o) => o.tripId || ['DELIVERED', 'RECEIVED', 'PARTIAL', 'FAILED'].includes(o.status))
  return (
    <>
      <PageHeader eyebrow="Orders" title="Deliveries" subtitle="Scheduled and in-progress deliveries to your outlet." />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck className="size-5" />} title="Nothing scheduled yet" body="Once the dispatcher publishes tomorrow’s plan, your delivery appears here with its vehicle and arrival time." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((o) => (
            <Link key={o.id} to={`/store/orders/${o.id}`}>
              <Card className="h-full p-5 transition hover:border-brand">
                <div className="mb-4 flex items-center justify-between">
                  <span className="id text-lg">{o.id}</span>
                  <StatusBadge s={o.status} />
                </div>
                <OrderSummary o={o} />
                <div className="mt-5">
                  <Timeline items={deliveryTimeline(o)} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
