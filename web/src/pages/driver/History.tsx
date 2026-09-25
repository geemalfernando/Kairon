import { AuditTimeline } from '../../components/AuditTimeline'
import { Card, PageHeader } from '../../components/ui'
import { useView } from '../../store'

export function History() {
  const d = useView()
  const events = d.audit.filter((e) => e.actor === 'DRIVER').sort((a, b) => a.at - b.at)
  return (
    <>
      <PageHeader eyebrow="Records" title="Delivery history" />
      <Card className="p-5">
        <AuditTimeline events={events.map((e) => ({ ...e, text: `${e.entity} · ${e.text}` }))} empty="No deliveries recorded yet today." />
      </Card>
    </>
  )
}
