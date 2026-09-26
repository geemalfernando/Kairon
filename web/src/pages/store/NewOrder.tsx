import { CheckCircle2, Clock, Minus, Plus, Snowflake, Sun } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Field, PageHeader, Textarea, toast } from '../../components/ui'
import { catalogFor, measure, tempOf } from '../../domain/seed'
import { fmtDate, orderCutoff } from '../../domain/time'
import type { OrderItem } from '../../domain/types'
import { outletOf } from '../../lib/select'
import { ops, useOps, useSession } from '../../store'

/** Sri Lanka 16:00 cutoff; late orders wait for the following operating run. */
export function useCutoff() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const { passed, remainingMs: ms, deliveryDate } = orderCutoff(now)
  const hh = Math.floor(ms / 3.6e6)
  const mm = Math.floor((ms % 3.6e6) / 6e4)
  const ss = Math.floor((ms % 6e4) / 1000)
  return { passed, label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, deliveryDate, urgent: !passed && ms < 3.6e6 }
}

export function NewOrder() {
  const user = useSession((s) => s.user)!
  const outlet = useOps((s) => outletOf(s.data, user.assignedOutlet))!
  const cat = catalogFor(outlet.brand)
  const products = useMemo(() => [...cat.chilled.map((c) => ({ c, chilled: true })), ...cat.ambient.map((c) => ({ c, chilled: false }))], [cat])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const cutoff = useCutoff()

  const items: OrderItem[] = products.map(({ c }) => ({ name: c[0], unit: c[1], qty: qty[c[0]] ?? 0 })).filter((i) => i.qty > 0)
  const temp = tempOf(outlet.brand, items)
  const m = measure(outlet.brand, items)

  if (done)
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <div className="eyebrow mt-4">Order received</div>
        <h1 className="mt-1 font-mono text-3xl font-bold">{done}</h1>
        <p className="mt-2 text-muted">{fmtDate(cutoff.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <Badge tone="success" dot className="mt-4">
          Confirmed
        </Badge>
        <p className="mt-6 text-sm text-muted">The order will enter planning after {cutoff.passed ? 'tomorrow’s' : 'today’s'} 16:00 cutoff. You’ll be notified when it’s scheduled.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Link to={`/store/orders/${done}`}>
            <Button>View order</Button>
          </Link>
          <Button variant="secondary" onClick={() => (setDone(null), setQty({}), setNotes(''))}>
            New order
          </Button>
        </div>
      </div>
    )

  return (
    <>
      <PageHeader eyebrow={`${outlet.name} · ${outlet.id}`} title="New order" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Products" eyebrow={`${outlet.brand} catalogue`} />
          <ul className="divide-y divide-line">
            {products.map(({ c, chilled }) => {
              const [name, unit] = c
              const v = qty[name] ?? 0
              const set = (n: number) => setQty((q) => ({ ...q, [name]: Math.max(0, Math.min(99, n)) }))
              return (
                <li key={name} className="flex items-center gap-3 px-5 py-4">
                  <span className={`grid size-9 place-items-center rounded-lg ${chilled ? 'bg-info-soft text-info-ink' : 'bg-surface-2 text-muted'}`}>{chilled ? <Snowflake className="size-4" /> : <Sun className="size-4" />}</span>
                  <div className="flex-1">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted">
                      {unit} · {chilled ? 'chilled' : 'ambient'}
                    </div>
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-line-strong">
                    <button className="grid size-11 place-items-center" onClick={() => set(v - 1)} aria-label={`Fewer ${name}`}>
                      <Minus className="size-4" />
                    </button>
                    <input inputMode="numeric" value={v} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 0)} className="h-11 w-12 bg-transparent text-center font-semibold tabular-nums focus:outline-none" aria-label={`${name} quantity`} />
                    <button className="grid size-11 place-items-center" onClick={() => set(v + 1)} aria-label={`More ${name}`}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-line p-5">
            <Field label="Notes">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access notes, substitutions…" />}</Field>
          </div>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="eyebrow">Delivery date</div>
            <div className="mt-1 font-display text-2xl font-semibold">{fmtDate(cutoff.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-[11px] text-muted">Temperature</div>
                <div className="text-sm font-semibold">{items.length ? (temp === 'CHILLED' ? 'Chilled' : 'Ambient') : '—'}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-[11px] text-muted">Volume</div>
                <div className="text-sm font-semibold tabular-nums">{m.volumeM3} m³</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2">
                <div className="text-[11px] text-muted">Weight</div>
                <div className="text-sm font-semibold tabular-nums">{m.weightKg} kg</div>
              </div>
            </div>
          </Card>
          <Card className={`p-5 ${cutoff.urgent ? 'border-attention' : ''}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-attention" /> Order cutoff · today 4:00 PM
            </div>
            {cutoff.passed ? (
              <p className="mt-2 text-sm text-muted">Today’s cutoff has passed. This order joins the next planning run.</p>
            ) : (
              <>
                <div className={`mt-1 font-display text-3xl font-semibold tabular-nums ${cutoff.urgent ? 'text-attention-ink' : ''}`}>{cutoff.label}</div>
                <div className="text-xs text-muted">time remaining</div>
              </>
            )}
          </Card>
          <Button
            size="xl"
            block
            disabled={!items.length}
            onClick={() => {
              const id = ops('createOrder', outlet.id, items, notes.trim(), cutoff.deliveryDate)
              toast('Order submitted', { body: id })
              setDone(id)
            }}
          >
            Submit order
          </Button>
        </div>
      </div>
    </>
  )
}
