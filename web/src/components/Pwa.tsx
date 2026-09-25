import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { create } from 'zustand'
import { Button, IconButton, Logo } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const isStandalone = () => typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

/** Captures the browser's install prompt as early as possible so any screen can offer it. */
export const useInstall = create<{ evt: BeforeInstallPromptEvent | null; installed: boolean; prompt: () => Promise<void> }>((set, get) => ({
  evt: null,
  installed: isStandalone(),
  async prompt() {
    const e = get().evt
    if (!e) return
    await e.prompt()
    const r = await e.userChoice
    set({ evt: null, installed: r.outcome === 'accepted' })
  },
}))
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useInstall.setState({ evt: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => useInstall.setState({ evt: null, installed: true }))
}

export const canInstall = () => !!useInstall.getState().evt || (isIos() && !isStandalone())

/** Service-worker lifecycle: new version available, and first "ready offline" moment. */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for new versions every 30 minutes while the app is open.
      if (reg) setInterval(() => void reg.update(), 30 * 60 * 1000)
    },
  })
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 6000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null
  return (
    <div role="status" className="fixed inset-x-3 bottom-24 z-[70] mx-auto max-w-sm animate-rise rounded-2xl border border-line bg-surface p-4 shadow-pop lg:bottom-6 lg:left-auto lg:right-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">{needRefresh ? <RefreshCw className="size-4" /> : <WifiOff className="size-4" />}</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">{needRefresh ? 'A new version of Kairon is ready' : 'Kairon is ready to work offline'}</div>
          <p className="text-xs text-muted">{needRefresh ? 'Reload to update. Anything waiting to sync is kept on this device.' : 'Every screen is saved on this device — keep working when the signal drops.'}</p>
          {needRefresh && (
            <Button size="sm" className="mt-3" icon={<RefreshCw className="size-3.5" />} onClick={() => updateServiceWorker(true)}>
              Reload
            </Button>
          )}
        </div>
        <IconButton label="Dismiss" className="-mr-2 -mt-2" onClick={() => (setNeedRefresh(false), setOfflineReady(false))}>
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}

/** Friendly install card for field roles; falls back to Add-to-Home-Screen steps on iOS. */
export function InstallPrompt() {
  const evt = useInstall((s) => s.evt)
  const installed = useInstall((s) => s.installed)
  const prompt = useInstall((s) => s.prompt)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('kairon-install-dismissed') === '1'
    } catch {
      return false
    }
  })
  const ios = isIos()
  if (installed || hidden || (!evt && !ios)) return null
  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem('kairon-install-dismissed', '1')
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md animate-rise rounded-2xl border border-line bg-surface p-4 shadow-pop lg:bottom-6 lg:left-auto lg:right-6">
      <div className="flex items-start gap-3">
        <Logo className="!gap-0 !text-[0px]" />
        <div className="flex-1">
          <div className="font-semibold">Install Kairon</div>
          <p className="text-sm text-muted">Access your routes quickly and continue working when connectivity drops.</p>
          {evt ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" icon={<Download className="size-4" />} onClick={() => prompt().then(dismiss)}>
                Install app
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          ) : (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              Tap <Share className="inline size-4 text-info" /> <b>Share</b>, then <b>Add to Home Screen</b>.
            </p>
          )}
        </div>
        <IconButton label="Dismiss" onClick={dismiss} className="-mr-2 -mt-2">
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
