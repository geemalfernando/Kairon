import { DISTRICTS } from './seed'
import type { Depot, District, Outlet } from './types'

export type LatLng = [number, number]

/** Real depot locations. */
export const DEPOT_GEO: Record<Depot, LatLng> = {
  Peliyagoda: [6.9606, 79.893],
  Kandy: [7.3187, 80.6291],
}

/** District centres, nudged inland on the coast so outlets never land in the sea. */
const CENTRE: Record<District, LatLng> = {
  Colombo: [6.895, 79.885],
  Gampaha: [7.06, 79.97],
  Kalutara: [6.63, 79.98],
  Galle: [6.07, 80.24],
  Kurunegala: [7.4818, 80.3609],
  Kandy: [7.2906, 80.6337],
}
const COASTAL: District[] = ['Colombo', 'Gampaha', 'Kalutara', 'Galle']

/** Known neighbourhoods for the demo story outlets. */
const PINNED: Record<string, LatLng> = {
  OUT032: [6.9147, 79.8784], // Borella
  OUT047: [6.9003, 79.8767], // Narahenpita
  OUT018: [6.8894, 79.8567], // Bambalapitiya
  OUT004: [6.9106, 79.8513], // Kollupitiya
  OUT056: [6.8779, 79.8783], // Kirulapone
  OUT043: [6.8511, 79.8659], // Dehiwala
}

/** Degrees per unit of the stylised network plane. */
const SCALE = 0.0055

export function outletGeo(o: Outlet): LatLng {
  if (PINNED[o.id]) return PINNED[o.id]
  const d = DISTRICTS[o.district]
  const [lat, lng] = CENTRE[o.district]
  const dx = o.x - d.x
  const dy = o.y - d.y
  // On the west coast only spread eastwards (inland).
  const east = COASTAL.includes(o.district) ? Math.abs(dx) : dx
  return [lat - dy * SCALE, lng + east * SCALE]
}
