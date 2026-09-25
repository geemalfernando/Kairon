import { Snowflake, Table2, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Callout, Card, CardHeader, cn, PageHeader, Segmented, Stat } from '../../components/ui'
import { isReefer } from '../../domain/seed'
import { useOps } from '../../store'
import { forecastFresh } from './forecast'

export function Capacity() {
  const d = useOps((s) => s.data)
  const data = useMemo(() => forecastFresh(d), [d])
  // One morning trip per reefer per day, six operating days.
  const reeferWeekly = useMemo(() => d.vehicles.filter((v) => isReefer(v.type) && v.depot === 'Peliyagoda' && v.status === 'AVAILABLE').reduce((s, v) => s + v.capacityM3 * 0.85, 0) * 6, [d])
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((w) => w.chilled + w.ambient), reeferWeekly) * 1.1
  const short = data.filter((w) => w.chilled > reeferWeekly)
  const ticks = niceTicks(max)

  const H = 260
  const y = (v: number) => H - (v / ticks[ticks.length - 1]) * H

  return (
    <>
      <PageHeader eyebrow="Planning" title="Capacity forecast" subtitle="Fresh volume at Peliyagoda for the next ten weeks, split by temperature." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Next week" value={`${data[0].chilled + data[0].ambient} m³`} sub="Fresh total" />
        <Stat label="Peak week" value={`W${data.reduce((a, b) => (b.chilled + b.ambient > a.chilled + a.ambient ? b : a)).week}`} sub="highest demand" tone="brand" icon={<TrendingUp className="size-4" />} />
        <Stat label="Reefer capacity" value={`${Math.round(reeferWeekly)} m³`} sub="per week, available fleet" tone="info" icon={<Snowflake className="size-4" />} />
        <Stat label="Weeks short on reefer" value={short.length} sub={short.length ? short.map((w) => `W${w.week}`).join(', ') : 'none'} tone={short.length ? 'attention' : 'success'} />
      </div>
      {short.length > 0 && (
        <Callout tone="warning" title={`Chilled demand exceeds reefer capacity in ${short.length} week${short.length > 1 ? 's' : ''}`} className="mb-6">
          Plan rental reefers or shift ambient Fresh items to dry trucks for W{short.map((w) => w.week).join(', W')}.
        </Callout>
      )}
      <Card>
        <CardHeader
          eyebrow="Next 10 weeks"
          title="Fresh volume by temperature (m³)"
          action={<Segmented size="sm" value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: <span className="inline-flex items-center gap-1"><Table2 className="size-3.5" /> Table</span> }]} />}
        />
        {view === 'chart' ? (
          <div className="p-5">
            <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
              <Legend color="var(--series-chilled)" label="Chilled" />
              <Legend color="var(--series-ambient)" label="Ambient" />
              <span className="inline-flex items-center gap-2">
                <span className="h-0 w-5 border-t-2 border-ink" /> Reefer capacity
              </span>
            </div>
            <div className="relative flex gap-3">
              <div className="relative w-10 shrink-0 text-right text-[11px] tabular-nums text-muted" style={{ height: H }}>
                {ticks.map((t) => (
                  <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
                    {t.toLocaleString()}
                  </span>
                ))}
              </div>
              <div className="relative flex-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
                {ticks.map((t) => (
                  <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: y(t) }} />
                ))}
                <div className="absolute inset-x-0 z-10 border-t-2 border-ink" style={{ top: y(reeferWeekly) }}>
                  <span className="absolute -top-5 right-0 rounded bg-surface px-1 text-[11px] font-semibold">Reefer capacity {Math.round(reeferWeekly)}</span>
                </div>
                <div className="absolute inset-0 flex items-end">
                  {data.map((w, i) => {
                    const hC = (w.chilled / ticks[ticks.length - 1]) * H
                    const hA = (w.ambient / ticks[ticks.length - 1]) * H
                    return (
                      <div key={w.week} className="relative flex h-full flex-1 flex-col items-center justify-end" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`Week ${w.week}: chilled ${w.chilled} m³, ambient ${w.ambient} m³`}>
                        <div className={cn('flex w-full max-w-6 flex-col transition-opacity', hover !== null && hover !== i && 'opacity-45')}>
                          <div className="rounded-t-[4px]" style={{ height: hA, background: 'var(--series-ambient)' }} />
                          <div className="border-t-2 border-surface" style={{ height: hC, background: 'var(--series-chilled)' }} />
                        </div>
                        {hover === i && (
                          <div className={cn('pointer-events-none absolute z-20 w-44 rounded-lg border border-line bg-surface p-3 text-xs shadow-pop', i > data.length - 3 ? 'right-1/2' : 'left-1/2')} style={{ bottom: hA + hC + 12 }}>
                            <div className="mb-1.5 font-semibold">Week {w.week}{w.note ? ` · ${w.note}` : ''}</div>
                            <Row color="var(--series-chilled)" label="Chilled" v={w.chilled} />
                            <Row color="var(--series-ambient)" label="Ambient" v={w.ambient} />
                            <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
                              <span>Total</span>
                              <span className="tabular-nums">{w.chilled + w.ambient} m³</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="ml-[52px] mt-2 flex">
              {data.map((w) => (
                <div key={w.week} className="flex-1 text-center text-[11px] text-muted">
                  W{w.week}
                  {w.note && <span className="mx-auto mt-0.5 block size-1 rounded-full bg-muted" title={w.note} />}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {['Week', 'Chilled m³', 'Ambient m³', 'Total m³', 'Note'].map((h) => (
                  <th key={h} className="px-5 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {data.map((w) => (
                <tr key={w.week}>
                  <td className="px-5 py-2.5 font-semibold">W{w.week}</td>
                  <td className={cn('px-5 py-2.5', w.chilled > reeferWeekly && 'font-semibold text-attention-ink')}>{w.chilled}</td>
                  <td className="px-5 py-2.5">{w.ambient}</td>
                  <td className="px-5 py-2.5">{w.chilled + w.ambient}</td>
                  <td className="px-5 py-2.5 text-muted">{w.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

function niceTicks(max: number) {
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)))
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => max / s <= 5)!
  const out = []
  for (let v = 0; v <= max + nice * 0.001 || out.length < 2; v += nice) out.push(Math.round(v))
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + Math.round(nice))
  return out
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className="size-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
)
const Row = ({ color, label, v }: { color: string; label: string; v: number }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
    <span className="tabular-nums">{v} m³</span>
  </div>
)
