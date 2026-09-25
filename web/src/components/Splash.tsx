import { useEffect, useState } from 'react'
import { cn } from './ui'

const KEY = 'kairon-intro-seen'

/**
 * Brand intro shown once per session (and on every launch of the installed app):
 * the route logo appears and the wordmark rises,
 * then the curtain lifts. Tap or press any key to skip; skipped for reduced motion.
 */
export function Splash() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>(() => {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'gone'
      return sessionStorage.getItem(KEY) ? 'gone' : 'show'
    } catch {
      return 'show'
    }
  })

  useEffect(() => {
    if (phase !== 'show') return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    const leave = setTimeout(() => setPhase('leave'), 2300)
    const skip = () => setPhase('leave')
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(leave)
      window.removeEventListener('keydown', skip)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'leave') return
    const t = setTimeout(() => setPhase('gone'), 750)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone') return null
  return (
    <div
      aria-hidden
      onClick={() => setPhase('leave')}
      className={cn('fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden bg-[#0a1315]', phase === 'leave' && 'splash-leave')}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal/30 blur-[140px] splash-glow" />
      {/* route line that sweeps under the wordmark */}
      <svg className="pointer-events-none absolute inset-x-0 top-[62%] h-24 w-full" viewBox="0 0 1000 100" preserveAspectRatio="none">
        <path d="M-20 70 C 180 70, 240 20, 420 30 S 700 90, 1020 40" fill="none" stroke="#5fd0cf" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="6 8" className="splash-route" />
        <circle r="5" fill="#D66D32" className="splash-truck">
          <animateMotion dur="2.2s" begin="0.4s" fill="freeze" path="M-20 70 C 180 70, 240 20, 420 30 S 700 90, 1020 40" />
        </circle>
      </svg>

      <div className={cn('relative flex flex-col items-center', phase === 'leave' && 'splash-zoom')}>
        <img src="/brand/route-logo-dark.svg" alt="" width="680" height="486" className="splash-tile h-auto w-44 sm:w-52" />
        <div className="mt-7 flex font-display text-3xl font-bold tracking-[0.3em] text-white sm:text-4xl">
          {'KAIRON'.split('').map((c, i) => (
            <span key={i} className="splash-letter" style={{ animationDelay: `${1.05 + i * 0.06}s` }}>
              {c}
            </span>
          ))}
        </div>
        <div className="splash-tagline mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Plan · Load · Deliver · Recover</div>
      </div>
    </div>
  )
}
