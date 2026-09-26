import { forecastDemand } from '../../domain/intelligence'
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
  return forecastDemand(d, 'Peliyagoda', 'Fresh').map((w) => ({ week: w.week, chilled: w.chilled, ambient: w.ambient, note: 'Demo baseline' }))
}
