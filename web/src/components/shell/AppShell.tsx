import { Copyright } from '../Copyright'
import { Bell, ChevronRight, CloudOff, LogOut, Menu, Moon, RefreshCw, Search, Sun, SunMoon, TriangleAlert, User as UserIcon, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { fmtClock, fmtDate, timeAgo } from '../../domain/time'
import type { Notification, Role, User } from '../../domain/types'
import { ops, useNetwork, useSession, useTheme, useView } from '../../store'
import { InstallPrompt } from '../Pwa'
import { Badge, cn, IconButton, Logo, severityTone, toast, toneDot } from '../ui'
import { ConflictModal } from './ConflictModal'
import { DemoDock } from './DemoDock'
import { HOME, NAV, ROLE_LABEL, type NavItem } from './nav'
import { SearchDialog } from './SearchDialog'

export function visibleNotifications(list: Notification[], user: User) {
  return list.filter((n) => n.to.includes(user.role) && (!n.outletId || n.outletId === user.assignedOutlet) && (!n.vehicleId || n.vehicleId === user.assignedVehicle))
}

function useBadges(role: Role) {
  const d = useView()
  const net = useNetwork()
  return {
    issues: role === 'DISPATCHER' ? d.issues.filter((i) => !i.resolved).length : role === 'LOADER' ? d.issues.filter((i) => !i.resolved && i.kind === 'SHORTFALL').length : 0,
    deferred: d.orders.filter((o) => o.status === 'DEFERRED' && !o.deferral?.confirmed).length,
    sync: net.pending + net.failed,
  }
}

export function AppShell() {
  const user = useSession((s) => s.user)!
  const nav = NAV[user.role]
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setMoreOpen(false), [loc.pathname])
  useSyncToasts()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allItems = nav.sections.flatMap((s) => s.items)
  const bottomItems = nav.bottom.map((to) => allItems.find((i) => i.to === to)!).filter(Boolean)
  const field = user.role === 'DRIVER' || user.role === 'LOADER'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-col">
        <TopBar user={user} onSearch={() => setSearchOpen(true)} onNotifications={() => setNotifOpen(true)} />
        <ConnectivityStrip role={user.role} />
        <main className={cn('mx-auto w-full flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pb-12', field ? 'max-w-3xl lg:max-w-5xl' : 'max-w-[1440px]')}>
          <Outlet />
        </main>
        <footer className="border-t border-line px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center text-xs text-muted lg:pb-5">
          <Copyright />
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {bottomItems.map((it) => (
            <BottomLink key={it.to} item={it} role={user.role} />
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted">
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>
      {moreOpen && <MoreSheet user={user} onClose={() => setMoreOpen(false)} />}

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} user={user} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {user.role === 'DRIVER' && <ConflictModal />}
      {field && (loc.pathname === '/driver' || loc.pathname === '/loader') && <InstallPrompt />}
      <DemoDock />
    </div>
  )
}

function Sidebar({ user }: { user: User }) {
  const badges = useBadges(user.role)
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link to={HOME[user.role]}>
          <Logo />
        </Link>
      </div>
      <div className="mx-4 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
        <div className="eyebrow !text-[10px]">{ROLE_LABEL[user.role]} workspace</div>
        <div className="mt-0.5 font-medium">{user.role === 'STORE_MANAGER' ? `Outlet ${user.assignedOutlet}` : `${user.depot} depot`}</div>
      </div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Workspace">
        {NAV[user.role].sections.map((s, i) => (
          <div key={i}>
            {s.title && <div className="eyebrow mb-1.5 px-2 !text-[10px]">{s.title}</div>}
            <ul className="space-y-0.5">
              {s.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) =>
                      cn('group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition', isActive ? 'bg-brand text-on-brand shadow-sm' : 'text-muted hover:bg-surface-2 hover:text-ink')
                    }
                  >
                    <it.icon className="size-[18px] shrink-0" />
                    <span className="flex-1">{it.label}</span>
                    {it.badge && badges[it.badge] > 0 && (
                      <Badge tone={it.badge === 'issues' ? 'critical' : it.badge === 'sync' ? 'info' : 'attention'} className="!px-1.5 !text-[10px]">
                        {badges[it.badge]}
                      </Badge>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <UserCard user={user} />
    </aside>
  )
}

function UserCard({ user }: { user: User }) {
  const signOut = useSession((s) => s.signOut)
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 border-t border-line p-4">
      <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal font-display text-sm font-semibold text-white">{user.name[0]}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block truncate text-xs text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
      </Link>
      <IconButton
        label="Sign out"
        onClick={() => {
          signOut()
          navigate('/login')
        }}
      >
        <LogOut className="size-4" />
      </IconButton>
    </div>
  )
}

function BottomLink({ item, role }: { item: NavItem; role: Role }) {
  const badges = useBadges(role)
  const n = item.badge ? badges[item.badge] : 0
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-ink' : 'text-muted')}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand" />}
          <span className="relative">
            <item.icon className="size-5" />
            {n > 0 && <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-attention px-1 text-[9px] font-bold text-white">{n}</span>}
          </span>
          {item.label.split(' ')[0]}
        </>
      )}
    </NavLink>
  )
}

function MoreSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const signOut = useSession((s) => s.signOut)
  const navigate = useNavigate()
  const items = NAV[user.role].sections.flatMap((s) => s.items)
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal aria-label="More">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] animate-rise overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold">Menu</span>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium', isActive ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line')}>
              <it.icon className="size-5" />
              {it.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/profile" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium">
            <UserIcon className="size-4" /> Profile
          </Link>
          <button
            onClick={() => {
              signOut()
              navigate('/login')
            }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export function NetworkPill({ compact }: { compact?: boolean }) {
  const net = useNetwork()
  const user = useSession((s) => s.user)
  const meta = {
    online: { label: 'Online', dot: 'bg-success', text: 'text-success-ink' },
    syncing: { label: 'Synchronizing', dot: 'bg-info animate-pulse', text: 'text-info-ink' },
    offline: { label: 'Offline', dot: 'bg-steel', text: 'text-muted' },
    error: { label: 'Sync error', dot: 'bg-critical', text: 'text-critical-ink' },
  }[net.status]
  const to = user?.role === 'DRIVER' ? '/driver/sync' : user?.role === 'LOADER' ? '/loader/sync' : undefined
  const body = (
    <span className={cn('inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-semibold', meta.text)}>
      <span className={cn('size-2 rounded-full', meta.dot)} />
      {!compact && meta.label}
      {net.pending > 0 && (
        <span className="inline-flex items-center gap-1 text-muted">
          <CloudOff className="size-3.5" /> {net.pending}
        </span>
      )}
    </span>
  )
  return to ? (
    <Link to={to} aria-label={`Network: ${meta.label}. ${net.pending} pending updates`}>
      {body}
    </Link>
  ) : (
    body
  )
}

function TopBar({ user, onSearch, onNotifications }: { user: User; onSearch: () => void; onNotifications: () => void }) {
  const d = useView()
  const unread = visibleNotifications(d.notifications, user).filter((n) => !n.readBy.includes(user.role)).length
  const { pref, setPref } = useTheme()
  const next = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light'
  const ThemeIcon = pref === 'light' ? Sun : pref === 'dark' ? Moon : SunMoon
  const searchable = user.role === 'DISPATCHER' || user.role === 'STORE_MANAGER'
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to={HOME[user.role]} className="lg:hidden">
          <Logo className="!text-[15px]" />
        </Link>
        <div className="hidden min-w-0 lg:block">
          <div className="text-sm font-semibold">{user.role === 'STORE_MANAGER' ? byOutlet(d, user.assignedOutlet) : `${user.depot} Operations`}</div>
          <div className="text-xs text-muted">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        {searchable && (
          <button onClick={onSearch} className="ml-4 hidden h-9 w-72 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-faint transition hover:border-line-strong md:flex">
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">Search ORD, OUT, VEH…</span>
            <kbd className="rounded border border-line bg-surface px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {searchable && (
            <IconButton label="Search" onClick={onSearch} className="md:hidden">
              <Search className="size-[18px]" />
            </IconButton>
          )}
          <NetworkPill compact={false} />
          <IconButton label={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={onNotifications}>
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-attention px-1 text-[9px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
          </IconButton>
          <IconButton label={`Theme: ${pref}. Switch to ${next}`} onClick={() => setPref(next)} className="hidden sm:grid">
            <ThemeIcon className="size-[18px]" />
          </IconButton>
          <Link to="/profile" className="ml-1 grid size-8 place-items-center rounded-full bg-teal font-display text-xs font-semibold text-white lg:hidden" aria-label="Profile">
            {user.name[0]}
          </Link>
        </div>
      </div>
    </header>
  )
}

const byOutlet = (d: ReturnType<typeof useView>, id?: string) => {
  const o = d.outlets.find((x) => x.id === id)
  return o ? `${o.name} · ${o.id}` : 'Store'
}

/** Persistent strip whenever the device is offline, syncing or needs attention. */
function ConnectivityStrip({ role }: { role: Role }) {
  const net = useNetwork()
  const to = role === 'DRIVER' ? '/driver/sync' : role === 'LOADER' ? '/loader/sync' : undefined
  if (net.status === 'online') return null
  const cfg = {
    offline: {
      cls: 'bg-ink text-bg',
      icon: <CloudOff className="size-4" />,
      text: (
        <>
          <b>You're offline.</b> {role === 'DRIVER' || role === 'LOADER' ? 'Your work stays available and is saved on this device.' : 'Showing the last known state.'}
          {net.pending > 0 && <span className="ml-1 opacity-80">{net.pending} {net.pending === 1 ? 'update' : 'updates'} waiting to sync</span>}
        </>
      ),
    },
    syncing: { cls: 'bg-info text-white', icon: <RefreshCw className="size-4 animate-spin" />, text: <>Connection restored · synchronizing {net.pending} {net.pending === 1 ? 'update' : 'updates'}…</> },
    error: { cls: 'bg-critical text-white', icon: <TriangleAlert className="size-4" />, text: <><b>Sync attention required.</b> {net.failed} {net.failed === 1 ? 'update' : 'updates'} could not be sent.</> },
  }[net.status]
  const inner = (
    <div className={cn('flex items-center gap-2.5 px-4 py-2 text-[13px] sm:px-6 lg:px-8', cfg.cls)} role="status">
      {cfg.icon}
      <span className="flex-1">{cfg.text}</span>
      {to && <ChevronRight className="size-4 opacity-70" />}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function useSyncToasts() {
  const net = useNetwork()
  const prev = useRef(net.status)
  useEffect(() => {
    const was = prev.current
    prev.current = net.status
    if (was === net.status) return
    if (net.status === 'offline') toast("You're offline", { tone: 'neutral', body: 'Keep working — updates are stored on this device.' })
    if (was === 'syncing' && net.status === 'online') toast('Synced successfully', { body: `Last synchronized ${fmtClock(Date.now())}` })
    if (was === 'offline' && net.status === 'online') toast('Connection restored', { tone: 'info' })
    if (net.status === 'error') toast('Some updates need attention', { tone: 'critical', body: 'Open Sync to retry.' })
  }, [net.status])
}

function NotificationsDrawer({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const d = useView()
  const list = useMemo(() => visibleNotifications(d.notifications, user), [d.notifications, user])
  const navigate = useNavigate()
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => ops('markRead', user.role), 1200)
    return () => clearTimeout(t)
  }, [open, user.role])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Notifications">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md animate-rise flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Notifications</h2>
            <p className="text-xs text-muted">{list.filter((n) => !n.readBy.includes(user.role)).length} unread</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          {list.length === 0 && <p className="p-8 text-center text-sm text-muted">You're all caught up.</p>}
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (n.link) navigate(n.link)
                onClose()
              }}
              className={cn('flex w-full gap-3 border-b border-line px-5 py-3.5 text-left transition hover:bg-surface-2', !n.readBy.includes(user.role) && 'bg-brand-soft/40')}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[severityTone[n.severity]])} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-faint">{timeAgo(n.at)}</span>
                </span>
                <span className="block text-sm text-muted">{n.body}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
