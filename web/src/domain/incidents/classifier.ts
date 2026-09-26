import { RESPONSIBILITIES, type Prediction, type Responsibility, type TrainedModel } from './types'

/**
 * Local responsibility classifier: multinomial logistic regression trained in the
 * browser (no server, no cloud). Training data is a seeded set of labelled
 * historical incidents plus every case a reviewer has labelled in this workspace.
 */

export const FEATURES = [
  { key: 'late', label: 'Minutes late vs promise', fmt: (v: number) => `${Math.round(v * 60)} min` },
  { key: 'geofence', label: 'Reached store geofence', fmt: (v: number) => (v > 0.5 ? 'yes' : 'no') },
  { key: 'dwell', label: 'Time waiting at store', fmt: (v: number) => `${Math.round(v * 30)} min` },
  { key: 'offroute', label: 'Distance off planned route', fmt: (v: number) => `${(v * 3).toFixed(1)} km` },
  { key: 'stationary', label: 'Stationary away from stops', fmt: (v: number) => `${Math.round(v * 30)} min` },
  { key: 'proof', label: 'Proof of delivery captured', fmt: (v: number) => (v > 0.5 ? 'yes' : 'no') },
  { key: 'proofGeo', label: 'Proof captured at the store', fmt: (v: number) => (v > 0.5 ? 'yes' : 'no') },
  { key: 'short', label: 'Units short at loading', fmt: (v: number) => `${Math.round(v * 5)}` },
  { key: 'closed', label: 'Store reported closed', fmt: (v: number) => (v > 0.5 ? 'yes' : 'no') },
  { key: 'zone', label: 'Share of district running late', fmt: (v: number) => `${Math.round(v * 100)}%` },
  { key: 'refunds', label: 'Store credits in last 90 days', fmt: (v: number) => `${Math.round(v * 5)}` },
  { key: 'contradicts', label: 'Claim contradicts evidence', fmt: (v: number) => (v > 0.5 ? 'yes' : 'no') },
] as const
export const F = FEATURES.length

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Labelled history: how incidents of each kind have looked. Overlapping on purpose. */
export function historicalIncidents(n = 1600, seed = 7): { x: number[]; y: number }[] {
  const r = rng(seed)
  const u = (a: number, b: number) => a + r() * (b - a)
  const noise = () => (r() - 0.5) * 0.18
  const rows: { x: number[]; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const y = i % 4
    // defaults: an ordinary delivery
    const x = [u(0, 0.25), 1, u(0.2, 0.6), u(0, 0.12), u(0, 0.15), 1, 1, 0, 0, u(0, 0.3), u(0, 0.5), 0]
    const variant = r()
    switch (RESPONSIBILITIES[y]) {
      case 'RIDER':
        if (variant < 0.35) {
          x[3] = u(0.4, 1.3) // detour
          x[0] = u(0.3, 1.2)
        } else if (variant < 0.7) {
          x[1] = 0 // "delivered" outside the geofence
          x[6] = 0
          x[2] = u(0, 0.3)
        } else {
          x[4] = u(0.6, 1.6) // stopped for a long time, district moving fine
          x[0] = u(0.4, 1.6)
          x[9] = u(0, 0.25)
        }
        break
      case 'OPERATIONS':
        if (variant < 0.65) x[7] = u(0.2, 1.2) // short at loading
        else {
          x[0] = u(0.3, 1.1) // left the depot late
          x[9] = u(0, 0.3)
        }
        break
      case 'MERCHANT':
        if (variant < 0.55) {
          x[8] = 1 // closed on arrival, driver waited
          x[2] = u(0.4, 1.1)
        } else {
          x[11] = 1 // claim contradicted by proof & geofence
          x[10] = u(0.6, 1.6)
        }
        break
      case 'EXTERNAL':
        x[9] = u(0.45, 1)
        x[0] = u(0.3, 1.6)
        x[4] = u(0.1, 0.8)
        break
    }
    for (const j of [0, 2, 3, 4, 7, 9, 10]) x[j] = Math.max(0, x[j] + noise())
    rows.push({ x, y: r() < 0.06 ? Math.floor(r() * 4) : y }) // 6% label noise
  }
  return rows
}

function softmax(z: number[]) {
  const m = Math.max(...z)
  const e = z.map((v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

function logits(w: number[][], z: number[]) {
  return w.map((row) => row[F] + row.slice(0, F).reduce((s, wj, j) => s + wj * z[j], 0))
}

/** Train on history + reviewer labels; hold out 20% of history to report accuracy. */
export function train(extra: { features: number[]; label: Responsibility }[] = [], version = 1): TrainedModel {
  const hist = historicalIncidents()
  const split = Math.floor(hist.length * 0.8)
  const reviewed = extra.flatMap((e) => Array.from({ length: 6 }, () => ({ x: e.features, y: RESPONSIBILITIES.indexOf(e.label) })))
  const trainRows = [...hist.slice(0, split), ...reviewed]
  const test = hist.slice(split)

  const mean = Array.from({ length: F }, (_, j) => trainRows.reduce((s, r) => s + r.x[j], 0) / trainRows.length)
  const std = Array.from({ length: F }, (_, j) => Math.sqrt(trainRows.reduce((s, r) => s + (r.x[j] - mean[j]) ** 2, 0) / trainRows.length) || 1)
  const Z = trainRows.map((r) => r.x.map((v, j) => (v - mean[j]) / std[j]))
  const w = RESPONSIBILITIES.map(() => new Array(F + 1).fill(0))
  const lr = 0.4
  const l2 = 1e-3
  for (let epoch = 0; epoch < 350; epoch++) {
    const grad = w.map(() => new Array(F + 1).fill(0))
    for (let i = 0; i < Z.length; i++) {
      const p = softmax(logits(w, Z[i]))
      for (let k = 0; k < 4; k++) {
        const g = p[k] - (trainRows[i].y === k ? 1 : 0)
        for (let j = 0; j < F; j++) grad[k][j] += g * Z[i][j]
        grad[k][F] += g
      }
    }
    for (let k = 0; k < 4; k++) for (let j = 0; j <= F; j++) w[k][j] -= lr * (grad[k][j] / Z.length + (j < F ? l2 * w[k][j] : 0))
  }
  const confusion = RESPONSIBILITIES.map(() => [0, 0, 0, 0])
  let correct = 0
  for (const r of test) {
    const p = softmax(logits(w, r.x.map((v, j) => (v - mean[j]) / std[j])))
    const pred = p.indexOf(Math.max(...p))
    confusion[r.y][pred]++
    if (pred === r.y) correct++
  }
  return { version, trainedAt: Date.now(), weights: w, mean, std, trainRows: split, reviewedRows: extra.length, holdoutAccuracy: correct / test.length, confusion }
}

export function predict(m: TrainedModel, x: number[]): Prediction {
  const z = x.map((v, j) => (v - m.mean[j]) / m.std[j])
  const p = softmax(logits(m.weights, z))
  const k = p.indexOf(Math.max(...p))
  const factors = z
    .map((zj, j) => ({ j, c: m.weights[k][j] * zj }))
    .filter((f) => f.c > 0.05)
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .map((f) => ({ feature: FEATURES[f.j].label, value: FEATURES[f.j].fmt(x[f.j]), weight: Math.round(f.c * 100) / 100 }))
  const probs = Object.fromEntries(RESPONSIBILITIES.map((r, i) => [r, p[i]])) as Record<Responsibility, number>
  return { probs, top: RESPONSIBILITIES[k], confidence: p[k], factors, modelVersion: m.version }
}
