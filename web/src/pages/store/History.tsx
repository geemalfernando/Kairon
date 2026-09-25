import { AuditTimeline } from '../../components/AuditTimeline'
import { Card, PageHeader } from '../../components/ui'
import { storeOrders } from '../../lib/select'
import { useSession, useView } from '../../store'

export function History() {
  const d = useView()
  const user = useSession((s) => s.user)!
  const ids = new Set(storeOrders(d, user.assignedOutlet).map((o) => o.id))
  const events = d.audit.filter((e) => ids.has(e.entity)).sort((a, b) => a.at - b.at)
  return (
    <>
      <PageHeader eyebrow="Records" title="History" subtitle="Everything that happened to your orders, in order." />
      <Card className="p-5">
        <AuditTimeline events={events.map((e) => ({ ...e, text: `${e.entity} · ${e.text}` }))} />
      </Card>
    </>
  )
}
