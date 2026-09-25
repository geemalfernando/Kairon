import { hm, isoDay } from './time'
import type { Brand, Depot, District, Order, OrderItem, Outlet, Temp, User, Vehicle, VehicleType } from './types'

/** Deterministic RNG so every demo run starts from the same network. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number, w = 3) => String(n).padStart(w, '0')

export const DISTRICTS: Record<District, { depot: Depot; x: number; y: number; spread: number; towns: string[]; weight: number }> = {
  Colombo: {
    depot: 'Peliyagoda',
    x: 30,
    y: 56,
    spread: 7,
    weight: 42,
    towns: ['Borella', 'Wellawatte', 'Kollupitiya', 'Dehiwala', 'Nugegoda', 'Maharagama', 'Kotte', 'Rajagiriya', 'Battaramulla', 'Kotahena', 'Bambalapitiya', 'Havelock', 'Kirulapone', 'Narahenpita', 'Moratuwa', 'Kohuwala'],
  },
  Gampaha: {
    depot: 'Peliyagoda',
    x: 36,
    y: 38,
    spread: 9,
    weight: 26,
    towns: ['Negombo', 'Ja-Ela', 'Wattala', 'Kadawatha', 'Gampaha', 'Kiribathgoda', 'Ragama', 'Minuwangoda', 'Kelaniya', 'Ekala', 'Kandana'],
  },
  Kalutara: { depot: 'Peliyagoda', x: 34, y: 78, spread: 7, weight: 14, towns: ['Panadura', 'Kalutara', 'Horana', 'Wadduwa', 'Beruwala', 'Bandaragama'] },
  Galle: { depot: 'Peliyagoda', x: 46, y: 95, spread: 5, weight: 6, towns: ['Galle', 'Hikkaduwa', 'Ambalangoda', 'Karapitiya'] },
  Kurunegala: { depot: 'Kandy', x: 56, y: 18, spread: 7, weight: 6, towns: ['Kurunegala', 'Kuliyapitiya', 'Pannala', 'Wariyapola'] },
  Kandy: { depot: 'Kandy', x: 74, y: 44, spread: 6, weight: 12, towns: ['Kandy', 'Peradeniya', 'Katugastota', 'Kundasale', 'Gampola', 'Digana'] },
}

export const DEPOTS: Record<Depot, { x: number; y: number }> = {
  Peliyagoda: { x: 33, y: 50 },
  Kandy: { x: 72, y: 40 },
}

const MANAGERS = ['Dilini', 'Ishara', 'Roshan', 'Anjali', 'Farzan', 'Tharaka', 'Madhavi', 'Senuri', 'Kavinda', 'Nadeesha', 'Hasitha', 'Priyanka']
const DRIVERS = ['Nimal', 'Kasun', 'Ruwan', 'Saman', 'Chaminda', 'Pradeep', 'Tharindu', 'Dilan', 'Asanka', 'Lahiru', 'Mahesh', 'Sunil', 'Janaka', 'Upul', 'Rohan', 'Isuru', 'Buddhika', 'Nuwan', 'Gayan', 'Sampath']

export const BRAND_WINDOWS: Record<Brand, [number, number][]> = {
  Fresh: [
    [hm(5), hm(7, 30)],
    [hm(4, 30), hm(7)],
    [hm(5), hm(8)],
  ],
  Style: [
    [hm(10), hm(12)],
    [hm(9, 30), hm(12, 30)],
  ],
  Tech: [
    [hm(14), hm(17)],
    [hm(13), hm(16)],
  ],
}

export function buildOutlets(): Outlet[] {
  const r = rng(11)
  const districts = Object.entries(DISTRICTS) as [District, (typeof DISTRICTS)[District]][]
  const total = districts.reduce((s, [, d]) => s + d.weight, 0)
  const townCursor: Record<string, number> = {}
  const outlets: Outlet[] = []
  for (let i = 1; i <= 120; i++) {
    let pick = r() * total
    let district = districts[0]
    for (const d of districts) {
      pick -= d[1].weight
      if (pick <= 0) {
        district = d
        break
      }
    }
    const [name, d] = district
    const b = r()
    const brand: Brand = b < 0.6 ? 'Fresh' : b < 0.84 ? 'Style' : 'Tech'
    const k = (townCursor[name + brand] = (townCursor[name + brand] ?? -1) + 1)
    const town = d.towns[(k + Math.floor(r() * d.towns.length)) % d.towns.length]
    const mall = brand !== 'Fresh' && r() < 0.3
    const windows = BRAND_WINDOWS[brand]
    outlets.push({
      id: `OUT${pad(i)}`,
      name: `${brand} ${town}${mall ? ' Mall' : ''}`,
      brand,
      district: name,
      depot: d.depot,
      vanOnly: r() < 0.14,
      mall,
      window: mall ? [hm(10), hm(11)] : windows[Math.floor(r() * windows.length)],
      x: d.x + (r() - 0.5) * 2 * d.spread,
      y: d.y + (r() - 0.5) * 2 * d.spread,
      lastServedDaysAgo: 1 + Math.floor(r() * 5),
      deferralsThisWeek: r() < 0.15 ? 1 : 0,
      manager: MANAGERS[i % MANAGERS.length],
    })
  }

  // The demo story: a Fresh cluster in Colombo on VEH014's route.
  const story: [string, string, [number, number], Partial<Outlet>?][] = [
    ['OUT004', 'Fresh Kollupitiya', [hm(5), hm(7, 30)]],
    ['OUT018', 'Fresh Bambalapitiya', [hm(5), hm(7, 30)]],
    ['OUT032', 'Fresh Borella', [hm(5), hm(7, 30)], { manager: 'Dilini' }],
    ['OUT047', 'Fresh Narahenpita', [hm(5), hm(7)]],
    ['OUT056', 'Fresh Kirulapone', [hm(5), hm(8)]],
  ]
  story.forEach(([id, name, window, extra], idx) => {
    const o = outlets.find((x) => x.id === id)!
    const pos = [
      [27, 55],
      [28, 59],
      [31, 56],
      [32, 60],
      [30, 63],
    ][idx]
    Object.assign(o, { name, window, brand: 'Fresh', district: 'Colombo', depot: 'Peliyagoda', vanOnly: false, mall: false, x: pos[0], y: pos[1] }, extra)
  })
  Object.assign(outlets.find((o) => o.id === 'OUT091')!, { vanOnly: true })
  Object.assign(outlets.find((o) => o.id === 'OUT043')!, { brand: 'Fresh', name: 'Fresh Dehiwala', district: 'Colombo', depot: 'Peliyagoda', window: [hm(5), hm(7, 30)], lastServedDaysAgo: 2, deferralsThisWeek: 1, mall: false })
  return outlets
}

const VEHICLE_SPECS: Record<VehicleType, { kg: number; m3: number; fuel: number; label: string }> = {
  REEFER_TRUCK: { kg: 4000, m3: 14, fuel: 150, label: 'Reefer truck' },
  REEFER_VAN: { kg: 1200, m3: 6, fuel: 100, label: 'Reefer van' },
  TRUCK: { kg: 6000, m3: 22, fuel: 150, label: 'Truck' },
  VAN: { kg: 1500, m3: 8, fuel: 100, label: 'Van' },
}
export const vehicleLabel = (t: VehicleType) => VEHICLE_SPECS[t].label
export const isReefer = (t: VehicleType) => t === 'REEFER_TRUCK' || t === 'REEFER_VAN'
export const isVan = (t: VehicleType) => t === 'VAN' || t === 'REEFER_VAN'

export function buildVehicles(): Vehicle[] {
  const r = rng(29)
  // 16 reefers (12 trucks, 4 vans), 26 trucks, 18 vans; every fifth vehicle is based in Kandy.
  // Force exact counts deterministically.
  const counts = { REEFER_TRUCK: 12, REEFER_VAN: 4, TRUCK: 26, VAN: 18 }
  const types: VehicleType[] = []
  const order: VehicleType[] = ['REEFER_TRUCK', 'TRUCK', 'VAN', 'TRUCK', 'REEFER_TRUCK', 'VAN', 'TRUCK', 'REEFER_VAN', 'TRUCK', 'VAN']
  let cur = 0
  while (types.length < 60) {
    const t = order[cur++ % order.length]
    if (counts[t] > 0) {
      counts[t]--
      types.push(t)
    }
  }
  return types.map((type, i) => {
    const s = VEHICLE_SPECS[type]
    const n = i + 1
    return {
      id: `VEH${pad(n)}`,
      type,
      depot: n % 5 === 0 ? 'Kandy' : 'Peliyagoda',
      capacityKg: s.kg,
      capacityM3: s.m3,
      fuelQuotaL: s.fuel,
      fuelUsedL: Math.round(s.fuel * (0.2 + r() * 0.55)),
      status: [7, 22, 38, 44, 51].includes(n) ? 'MAINTENANCE' : 'AVAILABLE',
      driver: DRIVERS[i % DRIVERS.length],
    } satisfies Vehicle
  }).map((v): Vehicle => {
    if (v.id === 'VEH014') return { ...v, type: 'REEFER_TRUCK', capacityKg: 4000, capacityM3: 14, fuelQuotaL: 150, fuelUsedL: 32, depot: 'Peliyagoda', driver: 'Nimal', status: 'AVAILABLE' }
    if (v.id === 'VEH008') return { ...v, type: 'REEFER_TRUCK', capacityKg: 4000, capacityM3: 14, fuelQuotaL: 150, depot: 'Peliyagoda', status: 'AVAILABLE', standby: true }
    if (v.id === 'VEH031') return { ...v, type: 'REEFER_VAN', capacityKg: 1200, capacityM3: 6, fuelQuotaL: 100, depot: 'Peliyagoda', status: 'AVAILABLE', standby: true }
    if (v.id === 'VEH024') return { ...v, fuelUsedL: 139 }
    return v
  })
}

const CATALOG: Record<Brand, { chilled: [string, string, number, number][]; ambient: [string, string, number, number][] }> = {
  // name, unit, m³ per unit, kg per unit
  Fresh: {
    chilled: [
      ['Milk', 'crates', 0.06, 14],
      ['Yoghurt', 'crates', 0.05, 11],
      ['Frozen goods', 'crates', 0.07, 13],
    ],
    ambient: [
      ['Produce', 'crates', 0.08, 10],
      ['Dry goods', 'cartons', 0.1, 9],
    ],
  },
  Style: { chilled: [], ambient: [['Apparel', 'cartons', 0.14, 7], ['Footwear', 'cartons', 0.1, 6]] },
  Tech: { chilled: [], ambient: [['Electronics', 'cartons', 0.12, 11], ['Accessories', 'boxes', 0.05, 3]] },
}

export function catalogFor(brand: Brand) {
  return CATALOG[brand]
}

export function measure(brand: Brand, items: OrderItem[]) {
  const all = [...CATALOG[brand].chilled, ...CATALOG[brand].ambient]
  let v = 0
  let w = 0
  for (const it of items) {
    const spec = all.find((c) => c[0] === it.name)
    if (!spec) continue
    v += spec[2] * it.qty
    w += spec[3] * it.qty
  }
  return { volumeM3: Math.round(v * 10) / 10, weightKg: Math.round(w) }
}

export function tempOf(brand: Brand, items: OrderItem[]): Temp {
  return items.some((i) => CATALOG[brand].chilled.some((c) => c[0] === i.name && i.qty > 0)) ? 'CHILLED' : 'AMBIENT'
}

export function priorityOf(o: Outlet, temp: Temp) {
  return Math.min(99, 40 + o.lastServedDaysAgo * 8 + o.deferralsThisWeek * 14 + (temp === 'CHILLED' ? 8 : 0))
}

export function buildOrders(outlets: Outlet[]): Order[] {
  const r = rng(47)
  const date = isoDay(1)
  const now = Date.now()
  const orders: Order[] = []
  let n = 1400
  const storyIds = new Set(['OUT004', 'OUT018', 'OUT032', 'OUT047', 'OUT056'])
  for (const o of outlets) {
    if (!storyIds.has(o.id) && r() < 0.1) continue // not every outlet orders every day
    const cat = CATALOG[o.brand]
    const items: OrderItem[] = []
    const chilled = o.brand === 'Fresh' && (storyIds.has(o.id) || o.id === 'OUT043' || r() < 0.72)
    if (chilled) {
      for (const [name, unit] of cat.chilled) if (r() < 0.75 || name === 'Milk') items.push({ name, unit, qty: 4 + Math.floor(r() * 14) })
    }
    for (const [name, unit] of cat.ambient) if (r() < 0.7 || items.length === 0) items.push({ name, unit, qty: 4 + Math.floor(r() * (o.brand === 'Fresh' ? 10 : 24)) })
    if (o.id === 'OUT032') {
      items.splice(0, items.length, { name: 'Milk', unit: 'crates', qty: 12 }, { name: 'Frozen goods', unit: 'crates', qty: 4 }, { name: 'Produce', unit: 'crates', qty: 8 })
    }
    const temp = tempOf(o.brand, items)
    const m = measure(o.brand, items)
    orders.push({
      id: `ORD${++n}`,
      outletId: o.id,
      brand: o.brand,
      temp,
      items,
      ...m,
      deliveryDate: date,
      status: 'CONFIRMED',
      priority: priorityOf(o, temp),
      createdAt: now - Math.floor(r() * 8 * 3600_000),
      seedVehicle: storyIds.has(o.id) ? 'VEH014' : undefined,
    })
  }
  return orders
}

export const DEMO_USERS: Record<string, User> = {
  DISPATCHER: { name: 'Geemal', email: 'dispatcher@kairon.demo', role: 'DISPATCHER', depot: 'Peliyagoda' },
  LOADER: { name: 'Kamal', email: 'loader@kairon.demo', role: 'LOADER', depot: 'Peliyagoda' },
  DRIVER: { name: 'Nimal', email: 'driver@kairon.demo', role: 'DRIVER', depot: 'Peliyagoda', assignedVehicle: 'VEH014' },
  STORE_MANAGER: { name: 'Dilini', email: 'store@kairon.demo', role: 'STORE_MANAGER', depot: 'Peliyagoda', assignedOutlet: 'OUT032' },
}
