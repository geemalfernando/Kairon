import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Columns3,
  FlaskConical,
  History,
  Home,
  LayoutDashboard,
  Package,
  PackagePlus,
  Radar,
  RefreshCw,
  Route,
  Store,
  TrendingUp,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../../domain/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: 'issues' | 'deferred' | 'sync'
  end?: boolean
}
export interface NavSection {
  title?: string
  items: NavItem[]
}

export const NAV: Record<Role, { sections: NavSection[]; bottom: string[] }> = {
  DISPATCHER: {
    sections: [
      { items: [{ to: '/dispatcher', label: 'Overview', icon: LayoutDashboard, end: true }] },
      {
        title: 'Operations',
        items: [
          { to: '/dispatcher/orders', label: 'Orders', icon: ClipboardList },
          { to: '/dispatcher/planning', label: 'Planning', icon: Columns3 },
          { to: '/dispatcher/routes', label: 'Routes', icon: Route },
          { to: '/dispatcher/vehicles', label: 'Vehicles', icon: Truck },
          { to: '/dispatcher/outlets', label: 'Outlets', icon: Store },
        ],
      },
      {
        title: 'Monitoring',
        items: [
          { to: '/dispatcher/live', label: 'Live operations', icon: Radar },
          { to: '/dispatcher/issues', label: 'Issues', icon: AlertTriangle, badge: 'issues' },
          { to: '/dispatcher/deferred', label: 'Deferred orders', icon: CalendarClock, badge: 'deferred' },
        ],
      },
      {
        title: 'Planning',
        items: [
          { to: '/dispatcher/capacity', label: 'Capacity forecast', icon: TrendingUp },
          { to: '/dispatcher/simulator', label: 'What-if simulator', icon: FlaskConical },
        ],
      },
      { title: 'Records', items: [{ to: '/dispatcher/history', label: 'History & audit', icon: History }] },
    ],
    bottom: ['/dispatcher', '/dispatcher/planning', '/dispatcher/live', '/dispatcher/issues'],
  },
  LOADER: {
    sections: [
      {
        items: [
          { to: '/loader', label: 'Today', icon: Home, end: true },
          { to: '/loader/trips', label: 'Trips', icon: Package },
          { to: '/loader/issues', label: 'Issues', icon: AlertTriangle, badge: 'issues' },
          { to: '/loader/history', label: 'History', icon: History },
          { to: '/loader/sync', label: 'Sync', icon: RefreshCw, badge: 'sync' },
        ],
      },
    ],
    bottom: ['/loader', '/loader/trips', '/loader/issues', '/loader/sync'],
  },
  DRIVER: {
    sections: [
      {
        items: [
          { to: '/driver', label: 'Today', icon: Home, end: true },
          { to: '/driver/route', label: 'Route', icon: Route },
          { to: '/driver/issues', label: 'Issues', icon: AlertTriangle },
          { to: '/driver/sync', label: 'Sync', icon: RefreshCw, badge: 'sync' },
          { to: '/driver/history', label: 'History', icon: History },
        ],
      },
    ],
    bottom: ['/driver', '/driver/route', '/driver/issues', '/driver/sync'],
  },
  STORE_MANAGER: {
    sections: [
      { items: [{ to: '/store', label: 'Overview', icon: LayoutDashboard, end: true }] },
      {
        title: 'Orders',
        items: [
          { to: '/store/orders', label: 'Orders', icon: ClipboardList, end: true },
          { to: '/store/orders/new', label: 'Create order', icon: PackagePlus },
          { to: '/store/deliveries', label: 'Deliveries', icon: Truck },
        ],
      },
      {
        items: [
          { to: '/store/issues', label: 'Issues', icon: AlertTriangle },
          { to: '/store/history', label: 'History', icon: History },
        ],
      },
    ],
    bottom: ['/store', '/store/orders', '/store/orders/new', '/store/deliveries'],
  },
}

export const HOME: Record<Role, string> = {
  DISPATCHER: '/dispatcher',
  LOADER: '/loader',
  DRIVER: '/driver',
  STORE_MANAGER: '/store',
}

export const ROLE_LABEL: Record<Role, string> = {
  DISPATCHER: 'Dispatcher',
  LOADER: 'Loader',
  DRIVER: 'Driver',
  STORE_MANAGER: 'Store manager',
}
