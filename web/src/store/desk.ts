import { useEffect } from 'react'
import { tick } from '../domain/incidents/engine'
import type { OpsData } from './events'
import { useOps } from './index'

/** Run an incident-desk operation against the shared operation. */
export const desk = <T,>(fn: (d: OpsData) => T) => useOps.getState().run(fn)

/**
 * The live watcher. Runs in the dispatcher's tab only, so a single device
 * advances the operations clock; every other role sees the results.
 */
export function useDeskWatcher(active: boolean) {
  const running = useOps((s) => !!s.data.desk?.live.running)
  useEffect(() => {
    if (!active || !running) return
    const id = setInterval(() => desk((d) => tick(d)), 1500)
    return () => clearInterval(id)
  }, [active, running])
}
