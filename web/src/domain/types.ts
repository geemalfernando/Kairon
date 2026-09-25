export type Role = 'DISPATCHER' | 'LOADER' | 'DRIVER' | 'STORE_MANAGER'
export type Brand = 'Fresh' | 'Style' | 'Tech'
export type Temp = 'CHILLED' | 'AMBIENT'
export type Depot = 'Peliyagoda' | 'Kandy'
export type District = 'Colombo' | 'Gampaha' | 'Kalutara' | 'Kandy' | 'Kurunegala' | 'Galle'
export type Severity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'

/** Minutes since midnight. */
export type Minutes = number

export interface Outlet {
  id: string
  name: string
  brand: Brand
  district: District
  depot: Depot
  vanOnly: boolean
  mall: boolean
  window: [Minutes, Minutes]
  /** Stylised map coordinates (0–100). */
  x: number
  y: number
  lastServedDaysAgo: number
  deferralsThisWeek: number
  manager: string
}

export type VehicleType = 'REEFER_TRUCK' | 'REEFER_VAN' | 'TRUCK' | 'VAN'
export type VehicleStatus = 'AVAILABLE' | 'MAINTENANCE' | 'BREAKDOWN'

export interface Vehicle {
  id: string
  type: VehicleType
  depot: Depot
  capacityKg: number
  capacityM3: number
  fuelQuotaL: number
  fuelUsedL: number
  status: VehicleStatus
  driver: string
  /** Held back from automatic planning for incident recovery. */
  standby?: boolean
}

export interface OrderItem {
  name: string
  unit: string
  qty: number
}

export type OrderStatus =
  | 'CONFIRMED'
  | 'PLANNED'
  | 'DEFERRED'
  | 'LOADED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'PARTIAL'
  | 'FAILED'
  | 'RECEIVED'

export interface Deferral {
  reason: string
  customerMessage: string
  internalNote?: string
  nextRecommendation: string
  acknowledged?: boolean
  /** Planner proposals stay unconfirmed until the dispatcher accepts them. */
  confirmed?: boolean
  at: number
}

export interface DeliveryRecord {
  outcome: 'DELIVERED' | 'PARTIAL' | 'REFUSED' | 'CLOSED' | 'NO_ACCESS'
  receiver?: string
  notes?: string
  photo?: string
  signature?: string
  arrivedAt?: number
  completedAt?: number
  offline?: boolean
}

export interface Receipt {
  received: number
  condition: 'GOOD' | 'MISSING' | 'DAMAGED' | 'INCORRECT'
  receiver: string
  at: number
}

export interface Order {
  id: string
  outletId: string
  brand: Brand
  temp: Temp
  items: OrderItem[]
  volumeM3: number
  weightKg: number
  deliveryDate: string
  status: OrderStatus
  priority: number
  tripId?: string
  deferral?: Deferral
  delivery?: DeliveryRecord
  receipt?: Receipt
  /** Loader count per item name. */
  loaded?: Record<string, number>
  shortfall?: { item: string; missing: number; reason: string; decision?: string }
  notes?: string
  createdAt: number
  /** Planner hint so the demo story always lands on the same truck. */
  seedVehicle?: string
}

export type TripStatus = 'DRAFT' | 'PLANNED' | 'LOADING' | 'LOADED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'ABORTED'

export interface Trip {
  id: string
  vehicleId: string
  number: 1 | 2
  brand: Brand
  district: District
  departure: Minutes
  stops: string[] // order ids, in delivery sequence
  status: TripStatus
  startedAt?: number
}

export type IssueKind =
  | 'BREAKDOWN'
  | 'REEFER_FAILURE'
  | 'SHORTFALL'
  | 'LATE_RISK'
  | 'DELIVERY_FAILED'
  | 'STORE_ISSUE'
  | 'FUEL'
  | 'OFFLINE_DRIVER'

export interface Issue {
  id: string
  kind: IssueKind
  severity: Severity
  title: string
  detail: string
  vehicleId?: string
  tripId?: string
  orderIds?: string[]
  createdAt: number
  resolved?: { at: number; by: Role; decision: string }
}

export interface Notification {
  id: string
  to: Role[]
  /** Restrict to a single outlet (store) or vehicle (driver). */
  outletId?: string
  vehicleId?: string
  severity: Severity
  title: string
  body: string
  at: number
  link?: string
  readBy: Role[]
}

export interface AuditEvent {
  id: string
  entity: string // ORD…, VEH…, OUT…, TRIP…
  at: number
  actor: Role | 'SYSTEM'
  text: string
}

export interface User {
  name: string
  email: string
  role: Role
  depot: Depot
  assignedVehicle?: string
  assignedOutlet?: string
}
