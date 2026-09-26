import { BrainCircuit } from 'lucide-react'
import { Link } from 'react-router-dom'
import { predictStops } from '../domain/intelligence'
import { fmtMin } from '../domain/time'
import { useNetwork, useSession, useView } from '../store'
import { Badge, Card } from './ui'

export function PredictionCard({ orderId }: { orderId: string }) {
  const d = useView()
  const net = useNetwork()
  const role = useSession((s) => s.user?.role)
  const p = predictStops(d, d.intelligence?.mode, net.online).find((x) => x.orderId === orderId)
  if (!p) return null
  return <Card className="my-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><BrainCircuit className="size-4 text-brand" /> Delivery outlook</h2>
      <Badge tone={p.confidence === 'Illustrative' ? 'info' : 'warning'}>{p.source} · {p.confidence}</Badge>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
      <div><p className="text-xs text-muted">{p.source === 'Planning allowance' ? 'Planned arrival' : 'Estimated arrival range'}</p><p className="mt-1 font-semibold">{p.arrivalRange ? p.source === 'Planning allowance' ? fmtMin(p.arrival!) : `${fmtMin(p.arrivalRange[0])}–${fmtMin(p.arrivalRange[1])}` : 'Awaiting route assignment'}</p></div>
      <div><p className="text-xs text-muted">Handling at outlet</p><p className="mt-1 font-semibold">{p.serviceRange[0]}–{p.serviceRange[1]} minutes</p></div>
    </div>
    <p className="mt-3 text-xs text-muted">{p.reasons.join(' · ')}. Estimates are illustrative, not live vehicle tracking or a delivery promise.</p>
    {role === 'DISPATCHER' && <Link to={`/dispatcher/predictions?order=${orderId}`} className="mt-3 inline-block text-sm font-semibold text-brand-ink">Review factors and next action →</Link>}
    {p.source === 'Planning allowance' && <Link to="/resilience" className="mt-3 inline-block text-sm font-semibold text-attention-ink">View service status and recovery →</Link>}
  </Card>
}
