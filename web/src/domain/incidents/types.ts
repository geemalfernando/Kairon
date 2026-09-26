import type { District, Minutes } from '../types'

/** Who most plausibly caused the incident. */
export type Responsibility = 'RIDER' | 'OPERATIONS' | 'MERCHANT' | 'EXTERNAL'
export const RESPONSIBILITIES: Responsibility[] = ['RIDER', 'OPERATIONS', 'MERCHANT', 'EXTERNAL']
export const RESPONSIBILITY_LABEL: Record<Responsibility, string> = {
  RIDER: 'Rider / driver',
  OPERATIONS: 'Operations (depot & loading)',
  MERCHANT: 'Merchant (receiving store)',
  EXTERNAL: 'External (traffic, weather, road)',
}

/** What the live watcher can notice on its own, before anyone complains. */
export type SignalKind = 'LATE_RISK' | 'STATIONARY' | 'OFF_ROUTE' | 'GHOST_DELIVERY' | 'FAILED_ATTEMPT' | 'SHORT_DELIVERY' | 'STORE_CLAIM'
export const SIGNAL_LABEL: Record<SignalKind, string> = {
  LATE_RISK: 'Projected to miss its window',
  STATIONARY: 'Vehicle stationary off-stop',
  OFF_ROUTE: 'Off planned route',
  GHOST_DELIVERY: 'Delivered away from the store',
  FAILED_ATTEMPT: 'Failed delivery attempt',
  SHORT_DELIVERY: 'Delivered short',
  STORE_CLAIM: 'Store claim received',
}

export interface Signal {
  kind: SignalKind
  at: number // real timestamp
  sim: Minutes // operations clock when detected
  detail: string
}

export interface GpsPoint {
  t: Minutes // operations clock
  lat: number
  lng: number
  /** Speed in km/h between this and the previous point. */
  v: number
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'pending'
export type CheckId = 'promise' | 'gps' | 'proof' | 'handover' | 'integrity'
export interface Check {
  id: CheckId
  label: string
  question: string
  status: CheckStatus
  evidence: string[]
}

export interface Prediction {
  probs: Record<Responsibility, number>
  top: Responsibility
  confidence: number
  /** Largest positive contributions to the top class, for explanation. */
  factors: { feature: string; value: string; weight: number }[]
  modelVersion: number
}

export type ResolutionAction = 'INSTANT_REFUND' | 'ZONE_NOTICE' | 'PROACTIVE_NOTICE' | 'REATTEMPT' | 'HUMAN_REVIEW' | 'NO_ACTION'
export interface Resolution {
  rule: string // e.g. "R4 · Rider or operations at fault"
  action: ResolutionAction
  summary: string
  amount?: number // LKR credit
  at: number
  by: 'AUTO' | 'REVIEWER'
}

export type CaseState = 'WATCHING' | 'RESOLVED' | 'REVIEW'

export interface IncidentCase {
  id: string
  orderId: string
  outletId: string
  tripId: string
  vehicleId: string
  district: District
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'
  state: CaseState
  signals: Signal[]
  openedAt: number
  openedSim: Minutes
  /** Minutes between first detection and the promised window closing (positive = early warning). */
  leadMin: number | null
  complaintBeforeDetection: boolean
  features: number[]
  checks: Check[]
  prediction?: Prediction
  resolution?: Resolution
  noticeId?: string
  review?: { label: Responsibility; note: string; at: number }
}

export interface ZoneNotice {
  id: string
  district: District
  at: number
  sim: Minutes
  delayMin: number
  cause: string
  orderIds: string[]
  outletIds: string[]
}

export interface Credit {
  id: string
  outletId: string
  orderId?: string
  amount: number
  reason: string
  at: number
  caseId?: string
  auto: boolean
}

export interface TrainedModel {
  version: number
  trainedAt: number
  weights: number[][] // [class][feature + bias]
  mean: number[]
  std: number[]
  trainRows: number
  reviewedRows: number
  holdoutAccuracy: number
  confusion: number[][] // [actual][predicted]
}

export type Scenario = 'NORMAL' | 'CONGESTION' | 'STATIONARY' | 'DETOUR' | 'GHOST' | 'CLOSED' | 'SHORT' | 'CLAIM'

export interface DeskState {
  live: { running: boolean; anchor: number; base: Minutes; speed: number; startedAt: number | null }
  scenarios: Record<string, Scenario> // tripId -> scenario
  congestedDistrict?: District
  cases: IncidentCase[]
  notices: ZoneNotice[]
  credits: Credit[]
  model?: TrainedModel
  /** Reviewer decisions become extra labelled rows for local retraining. */
  labels: { features: number[]; label: Responsibility; at: number }[]
  feed: { at: number; sim: Minutes; text: string; tone: 'info' | 'warning' | 'critical' | 'success' }[]
  lastScan: number
}
