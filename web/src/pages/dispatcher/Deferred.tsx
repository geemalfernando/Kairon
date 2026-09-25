import { CalendarClock, Snowflake } from 'lucide-react'
import { useState } from 'react'
import { OutletMap } from '../../components/RouteMap'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, toast } from '../../components/ui'
import { timeAgo } from '../../domain/time'
import type { Order } from '../../domain/types'
import { outletOf } from '../../lib/select'
import { ops, useOps } from '../../store'
import { DeferModal, OrderDrawer } from './shared'

export function Deferred() {
  const d = useOps((s) => s.data)
  const [view, setView] = useState<'proposed' | 'confirmed'>('proposed')
  const [drawer, setDrawer] = useState<Order>()
  const [deferring, setDeferring] = useState<Order>()
  const all = d.orders.filter((o) => o.status === 'DEFERRED').sort((a, b) => b.priority - a.priority)
  const list = all.filter((o) => (view === 'proposed' ? !o.deferral?.confirmed : o.deferral?.confirmed))
  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Deferred orders"
        subtitle="Every deferral carries a reason, a priority and the next recommended run — and the store sees why."
        actions={
          view === 'proposed' &&
          list.length > 0 && (
            <Button variant="attention" onClick={() => (list.forEach((o) => ops('confirmDeferral', o.id)), toast(`${list.length} deferrals confirmed`, { tone: 'attention', body: 'Stores have been notified.' }))}>
              Confirm all {list.length}
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'proposed', label: `Awaiting decision (${all.filter((o) => !o.deferral?.confirmed).length})` },
            { value: 'confirmed', label: `Confirmed (${all.filter((o) => o.deferral?.confirmed).length})` },
          ]}
        />
      </div>
      {all.length > 0 && (
        <OutletMap
          outlets={d.outlets}
          flagged={new Set(all.map((o) => o.outletId))}
          muted={new Set(d.outlets.filter((o) => !all.some((x) => x.outletId === o.id)).map((o) => o.id))}
          flaggedLabel="Deferred"
          className="mb-5 h-80"
          describe={(o) => all.find((x) => x.outletId === o.id)?.deferral?.reason ?? o.district}
        />
      )}
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock className="size-5" />} title={view === 'proposed' ? 'No deferrals waiting for a decision' : 'No confirmed deferrals'} body="Deferrals appear here when the planner can’t fit an order, or when you defer one manually." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const out = outletOf(d, o.outletId)!
            return (
              <Card key={o.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <button onClick={() => setDrawer(o)} className="id text-lg hover:underline">
                      {out.id}
                    </button>
                    <div className="text-sm text-muted">
                      {out.name} · <span className="id">{o.id}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-semibold text-attention-ink">{o.priority}</div>
                    <div className="text-[11px] text-muted">priority</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge>{o.brand}</Badge>
                  {o.temp === 'CHILLED' && (
                    <Badge tone="info">
                      <Snowflake className="size-3" /> Chilled
                    </Badge>
                  )}
                  {out.vanOnly && <Badge tone="warning">Van only</Badge>}
                </div>
                <div className="mt-4 rounded-lg bg-attention-soft p-3">
                  <div className="text-xs text-attention-ink">Reason</div>
                  <div className="font-semibold text-attention-ink">{o.deferral?.reason}</div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Deferred before</dt>
                    <dd className="font-medium">{out.deferralsThisWeek > (o.deferral?.confirmed ? 1 : 0) ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Last served</dt>
                    <dd className="font-medium">{out.lastServedDaysAgo} d ago</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Next</dt>
                    <dd className="font-medium">{o.deferral?.nextRecommendation}</dd>
                  </div>
                </dl>
                {o.deferral?.confirmed && <p className="mt-3 text-xs text-muted">Confirmed {timeAgo(o.deferral.at)}{o.deferral.acknowledged ? ' · acknowledged by store' : ''}</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => setDrawer(o)}>
                    Reallocate
                  </Button>
                  {!o.deferral?.confirmed && (
                    <Button variant="attention" className="flex-1" onClick={() => setDeferring(o)}>
                      Confirm deferral
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <OrderDrawer order={drawer} onClose={() => setDrawer(undefined)} onDefer={(o) => (setDrawer(undefined), setDeferring(o))} />
      <DeferModal key={deferring?.id} order={deferring} open={!!deferring} onClose={() => setDeferring(undefined)} />
    </>
  )
}
