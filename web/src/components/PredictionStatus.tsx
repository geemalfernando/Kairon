import { Link } from 'react-router-dom'
import { MODE_LABELS } from '../domain/intelligence'
import { useView } from '../store'

export function PredictionStatus() {
  const mode = useView().intelligence?.mode ?? 'READY'
  if (mode === 'READY') return null
  return <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-attention/20 bg-attention-soft px-4 py-2 text-sm text-attention-ink"><span>{MODE_LABELS[mode]} · {mode === 'LOW_CONFIDENCE' ? 'Review wider estimate ranges.' : 'Using planning allowances; risk probabilities are hidden.'}</span><Link className="font-semibold underline" to="/resilience">Recovery options</Link></div>
}
