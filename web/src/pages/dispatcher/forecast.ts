import type { OpsData } from '../../store/events'

export interface WeekForecast {
  week: number
  chilled: number
  ambient: number
  note?: string
}

export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)
}

/**
 * Ten-week Fresh volume forecast for the depot. Seasonal multipliers stand in
 * for the Datathon model until the backend forecast endpoint exists.
 */
export function forecastFresh(d: OpsData): WeekForecast[] {
  const fresh = d.orders.filter((o) => o.brand === 'Fresh')
  const dailyChilled = fresh.filter((o) => o.temp === 'CHILLED').reduce((s, o) => s + o.volumeM3, 0)
  const dailyAmbient = fresh.filter((o) => o.temp === 'AMBIENT').reduce((s, o) => s + o.volumeM3, 0) + fresh.filter((o) => o.temp === 'CHILLED').length * 0.9
  const start = isoWeek() + 1
  const season = [1, 1.04, 1.12, 1.26, 1.08, 1.02, 1.05, 1.1, 1.18, 1.34]
  const notes: Record<number, string> = { 3: 'Festival week', 8: 'Payday + monsoon', 9: 'Year-end peak' }
  return season.map((f, i) => ({
    week: ((start + i - 1) % 52) + 1,
    chilled: Math.round(dailyChilled * 6 * f * 0.52),
    ambient: Math.round(dailyAmbient * 6 * f * 0.55),
    note: notes[i],
  }))
}
