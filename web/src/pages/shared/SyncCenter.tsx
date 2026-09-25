import { Check, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader } from '../../components/ui'
import { fmtClock, timeAgo } from '../../domain/time'
import { useDevice, useNetwork, useOps } from '../../store'
import { describeEvent } from '../../store/events'

/** The device outbox, in plain words — no mention of IndexedDB or queues. */
export function SyncCenter() {
  const net = useNetwork()
  const retry = useDevice((s) => s.retry)
  const sync = useDevice((s) => s.sync)
  const d = useOps((s) => s.data)
  const failed = net.queue.filter((q) => q.status === 'failed')
  const total = net.queue.length
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="This device" title="Sync" subtitle={net.lastSync ? `Last synchronized ${fmtClock(net.lastSync)} (${timeAgo(net.lastSync)})` : 'Everything you record is saved here first.'} />

      {net.status === 'offline' && (
        <Callout tone="neutral" icon={<CloudOff className="size-5" />} title="You’re offline" className="mb-4">
          {net.pending} {net.pending === 1 ? 'update is' : 'updates are'} waiting for connection. Keep working — nothing will be lost.
        </Callout>
      )}
      {net.status === 'syncing' && (
        <Callout tone="info" icon={<RefreshCw className="size-5 animate-spin" />} title="Synchronizing…" className="mb-4">
          Sending {net.pending} updates.
        </Callout>
      )}
      {failed.length > 0 && net.status !== 'syncing' && (
        <Callout tone="critical" icon={<TriangleAlert className="size-5" />} title="Sync attention required" className="mb-4" action={net.online && <Button size="sm" onClick={() => retry()}>Retry all</Button>}>
          {total - failed.length === 0 ? '' : `${total - failed.length} of ${total} waiting. `}
          {failed.length} {failed.length === 1 ? 'update' : 'updates'} failed. You don’t need to redo the delivery — just retry.
        </Callout>
      )}

      <Card>
        <CardHeader title="Waiting to sync" eyebrow={`${total} ${total === 1 ? 'update' : 'updates'}`} action={net.online && net.pending > 0 && <Button size="sm" variant="secondary" onClick={() => sync()}>Sync now</Button>} />
        {total === 0 ? (
          <EmptyState icon={<Check className="size-5" />} title="Everything synchronized" body={net.lastSync ? `Last synchronized ${fmtClock(net.lastSync)}` : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {net.queue.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`grid size-6 place-items-center rounded-full ${q.status === 'failed' ? 'bg-critical-soft text-critical-ink' : 'bg-surface-2 text-muted'}`}>
                  {q.status === 'failed' ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{describeEvent(q.event, d)}</div>
                  <div className="text-xs text-muted">
                    {q.status === 'failed' ? `Upload failed · ${q.error}` : `Saved on device · ${fmtClock(q.at)}`}
                  </div>
                </div>
                {q.status === 'failed' ? (
                  <Button size="sm" variant="secondary" disabled={!net.online} onClick={() => retry(q.id)}>
                    Retry
                  </Button>
                ) : (
                  <Badge>{net.online ? 'Sending' : 'Waiting'}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
