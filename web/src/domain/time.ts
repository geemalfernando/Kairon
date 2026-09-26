import type { Minutes } from './types'

export const hm = (h: number, m = 0): Minutes => h * 60 + m

export function fmtMin(min: Minutes): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const fmtWindow = ([a, b]: [Minutes, Minutes]) => `${fmtMin(a)}–${fmtMin(b)}`

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Date(d).toLocaleDateString('en-GB', opts)
}

/** Civil dates in the operation's Asia/Colombo timezone, independent of the viewer. */
export function isoDay(offset = 0, now = new Date()): string {
  const local = new Date(now.getTime() + 330 * 60000)
  local.setUTCDate(local.getUTCDate() + offset)
  return local.toISOString().slice(0, 10)
}

export function nextOperatingDate(date: string, offset = 1): string {
  const day = new Date(date + 'T00:00:00Z')
  day.setUTCDate(day.getUTCDate() + offset)
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

export function orderCutoff(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000)
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  const passed = minutes >= 16 * 60
  const remainingMs = Math.max(0, ((16 * 60 - minutes) * 60 - local.getUTCSeconds()) * 1000)
  const next = nextOperatingDate(isoDay(0, now))
  return { passed, remainingMs, deliveryDate: passed ? nextOperatingDate(next) : next }
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
