import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { byId } from '../domain/rules'
import { DEMO_USERS } from '../domain/seed'
import type { Role, User } from '../domain/types'
import { applyEvent, commands, seedOps, uid, type FieldEvent, type OpsData, type QueuedEvent } from './events'

/**
 * Browser tabs keep their own sign-in (so a demo can run four roles side by side);
 * the installed app remembers the user between launches.
 */
const isInstalledApp = () => typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Shared operational state ("the server"). Persisted to localStorage and kept
// in step across tabs, so a dispatcher tab and a driver tab see one operation.
// ---------------------------------------------------------------------------

interface OpsStore {
  data: OpsData
  run: <T>(fn: (d: OpsData) => T) => T
  reset: () => void
}

export const useOps = create<OpsStore>()(
  persist(
    (set, get) => ({
      data: seedOps(),
      run(fn) {
        const draft = structuredClone(get().data)
        const out = fn(draft)
        set({ data: draft })
        return out
      },
      reset() {
        set({ data: seedOps() })
      },
    }),
    { name: 'kairon-ops-v1', storage: createJSONStorage(() => localStorage) },
  ),
)

export const ops = <K extends keyof typeof commands>(name: K, ...args: Parameters<(typeof commands)[K]> extends [OpsData, ...infer R] ? R : never) =>
  useOps.getState().run((d) => (commands[name] as (d: OpsData, ...a: unknown[]) => unknown)(d, ...args)) as ReturnType<(typeof commands)[K]>

// ---------------------------------------------------------------------------
// Session: who is signed in on this tab and whether this tab is "offline".
// ---------------------------------------------------------------------------

interface SessionStore {
  user: User | null
  simulateOffline: boolean
  netOnline: boolean
  signIn: (u: User) => void
  signOut: () => void
  setSimulateOffline: (v: boolean) => void
}

export const useSession = create<SessionStore>()(
  persist(
    (set) => ({
      user: null,
      simulateOffline: false,
      netOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      signIn: (user) => set({ user, simulateOffline: false }),
      signOut: () => set({ user: null, simulateOffline: false }),
      setSimulateOffline: (simulateOffline) => {
        set({ simulateOffline })
        if (simulateOffline) useDevice.getState().takeSnapshot()
        else void useDevice.getState().sync()
      },
    }),
    { name: 'kairon-session', storage: createJSONStorage(() => (isInstalledApp() ? localStorage : sessionStorage)), partialize: (s) => ({ user: s.user, simulateOffline: s.simulateOffline }) },
  ),
)

export const isOnline = () => {
  const s = useSession.getState()
  return s.netOnline && !s.simulateOffline
}

export function demoUser(role: Role): User {
  return DEMO_USERS[role]
}

// ---------------------------------------------------------------------------
// Device outbox: field events recorded while offline, kept per user in
// localStorage so they survive the app being closed, replayed on reconnect.
// ---------------------------------------------------------------------------

export interface RouteConflict {
  tripId: string
  offline: string[]
  latest: string[]
  reassigned: string[]
  deliveredOffline: string[]
}

interface Outbox {
  queue: QueuedEvent[]
  /** The operation as this device last saw it before losing connection. */
  snapshot: OpsData | null
  lastSync: number | null
}

interface DeviceStore {
  boxes: Record<string, Outbox>
  syncing: boolean
  flakyUploads: boolean
  conflict: RouteConflict | null
  box: () => Outbox
  record: (event: FieldEvent) => void
  takeSnapshot: () => void
  sync: () => Promise<void>
  retry: (id?: string) => Promise<void>
  discardConflict: () => void
  setFlaky: (v: boolean) => void
  clear: () => void
}

const emptyBox: Outbox = { queue: [], snapshot: null, lastSync: null }
const key = () => useSession.getState().user?.email ?? 'anon'

export const useDevice = create<DeviceStore>()(
  persist(
    (set, get) => {
      const patch = (fn: (b: Outbox) => Partial<Outbox>) => {
        const k = key()
        const b = get().boxes[k] ?? emptyBox
        set({ boxes: { ...get().boxes, [k]: { ...b, ...fn(b) } } })
      }
      return {
        boxes: {},
        syncing: false,
        flakyUploads: false,
        conflict: null,
        box: () => get().boxes[key()] ?? emptyBox,
        record(event) {
          const user = useSession.getState().user
          if (!user) return
          const q: QueuedEvent = { id: uid('evt'), at: Date.now(), actor: user.role, event, status: 'pending' }
          const interruptedProof = event.type === 'PROOF' && !!event.photo && get().flakyUploads
          if (isOnline() && !get().syncing && !interruptedProof) {
            useOps.getState().run((d) => applyEvent(d, q))
            patch(() => ({ lastSync: Date.now() }))
          } else {
            if (!get().box().snapshot) get().takeSnapshot()
            patch((b) => ({ queue: [...b.queue, q] }))
            if (interruptedProof && isOnline()) void get().sync()
          }
        },
        takeSnapshot() {
          if (get().box().snapshot) return
          patch(() => ({ snapshot: structuredClone(useOps.getState().data) }))
        },
        async sync() {
          if (get().syncing || !isOnline()) return
          const box = get().box()
          const user = useSession.getState().user
          if (!box.queue.some((q) => q.status === 'pending')) {
            patch(() => ({ snapshot: null }))
            return
          }
          set({ syncing: true })
          await sleep(700)

          // Did the dispatcher change this driver's route while we were away?
          let conflict: RouteConflict | null = null
          if (user?.role === 'DRIVER' && box.snapshot) {
            const before = box.snapshot.trips.find((t) => t.vehicleId === user.assignedVehicle && ['LOADED', 'IN_PROGRESS', 'PAUSED'].includes(t.status))
            const now = before && byId(useOps.getState().data.trips, before.id)
            if (before && now && before.stops.join() !== now.stops.join()) {
              conflict = { tripId: before.id, offline: before.stops, latest: now.stops, reassigned: before.stops.filter((s) => !now.stops.includes(s)), deliveredOffline: [] }
            }
          }

          const conflicts: string[] = []
          for (const q of box.queue) {
            if (q.status !== 'pending') continue
            await sleep(320)
            if (!isOnline()) break
            if (get().flakyUploads && q.event.type === 'PROOF' && q.event.photo) {
              patch((b) => ({ queue: b.queue.map((x) => (x.id === q.id ? { ...x, status: 'failed', error: 'File upload interrupted' } : x)) }))
              continue
            }
            useOps.getState().run((d) => applyEvent(d, q, conflicts))
            patch((b) => ({ queue: b.queue.filter((x) => x.id !== q.id) }))
          }
          if (conflict) conflict.deliveredOffline = [...new Set(conflicts)]
          const failed = get().box().queue.some((q) => q.status === 'failed')
          patch((b) => ({ snapshot: null, lastSync: failed ? b.lastSync : Date.now() }))
          set({ syncing: false, conflict })
        },
        async retry(id) {
          patch((b) => ({ queue: b.queue.map((q) => (!id || q.id === id ? { ...q, status: 'pending', error: undefined } : q)) }))
          set({ flakyUploads: false })
          await get().sync()
        },
        discardConflict: () => set({ conflict: null }),
        setFlaky: (flakyUploads) => set({ flakyUploads }),
        clear: () => set({ boxes: {}, conflict: null }),
      }
    },
    { name: 'kairon-device-v1', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ boxes: s.boxes, flakyUploads: s.flakyUploads }) },
  ),
)

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Network status as the UI shows it. */
export function useNetwork() {
  const netOnline = useSession((s) => s.netOnline)
  const simulateOffline = useSession((s) => s.simulateOffline)
  const syncing = useDevice((s) => s.syncing)
  const email = useSession((s) => s.user?.email ?? 'anon')
  const box = useDevice((s) => s.boxes[email]) ?? emptyBox
  const online = netOnline && !simulateOffline
  const pending = box.queue.filter((q) => q.status === 'pending').length
  const failed = box.queue.filter((q) => q.status === 'failed').length
  const status: 'online' | 'offline' | 'syncing' | 'error' = !online ? 'offline' : syncing ? 'syncing' : failed ? 'error' : 'online'
  return { online, status, pending, failed, queue: box.queue, lastSync: box.lastSync }
}

/**
 * What this device believes the operation looks like: the last state it saw,
 * plus everything it has recorded but not yet synchronised.
 */
export function useView(): OpsData {
  const data = useOps((s) => s.data)
  const email = useSession((s) => s.user?.email ?? 'anon')
  const box = useDevice((s) => s.boxes[email])
  return useMemo(() => {
    if (!box || (!box.snapshot && !box.queue.length)) return data
    const d = structuredClone(box.snapshot ?? data)
    for (const q of box.queue) applyEvent(d, q)
    return d
  }, [data, box])
}

/** Wire browser connectivity + cross-tab storage into the stores. */
export function useRuntimeBindings() {
  useEffect(() => {
    const up = () => {
      useSession.setState({ netOnline: true })
      void useDevice.getState().sync()
    }
    const down = () => {
      useSession.setState({ netOnline: false })
      useDevice.getState().takeSnapshot()
    }
    const storage = (e: StorageEvent) => {
      if (e.key === 'kairon-ops-v1') void useOps.persist.rehydrate()
      if (e.key === 'kairon-device-v1') void useDevice.persist.rehydrate()
    }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    window.addEventListener('storage', storage)
    if (isOnline()) void useDevice.getState().sync()
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.removeEventListener('storage', storage)
    }
  }, [])
}

export function resetDemo() {
  useOps.getState().reset()
  useDevice.getState().clear()
  useSession.getState().setSimulateOffline(false)
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type ThemePref = 'light' | 'dark' | 'system'

interface ThemeStore {
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export const useTheme = create<ThemeStore>((set) => {
  let pref: ThemePref = 'system'
  try {
    pref = (localStorage.getItem('kairon-theme') as ThemePref) || 'system'
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useTheme.getState().pref))
  }
  return {
    pref,
    setPref(p) {
      try {
        localStorage.setItem('kairon-theme', p)
      } catch {
        /* storage unavailable */
      }
      applyTheme(p)
      set({ pref: p })
    },
  }
})
