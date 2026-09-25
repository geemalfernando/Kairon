import { FlaskConical, RotateCcw, Wifi, WifiOff, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Role } from '../../domain/types'
import { demoUser, ops, resetDemo, useDevice, useOps, useSession } from '../../store'
import { Badge, Button, cn, IconButton, toast } from '../ui'
import { HOME, ROLE_LABEL } from './nav'

/** Demo-only tools for judges. Clearly separated from the product UI. */
export function DemoDock() {
  const [open, setOpen] = useState(false)
  const plan = useOps((s) => s.data.plan)
  const closed = useOps((s) => s.data.ordersClosed)
  const simOff = useSession((s) => s.simulateOffline)
  const setOff = useSession((s) => s.setSimulateOffline)
  const signIn = useSession((s) => s.signIn)
  const user = useSession((s) => s.user)
  const flaky = useDevice((s) => s.flakyUploads)
  const setFlaky = useDevice((s) => s.setFlaky)
  const navigate = useNavigate()

  const switchRole = (r: Role) => {
    signIn(demoUser(r))
    navigate(HOME[r])
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 left-3 z-40 inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface/95 px-3 text-xs font-semibold text-muted shadow-card backdrop-blur hover:text-ink lg:bottom-5 lg:left-[268px]"
        aria-expanded={open}
      >
        <FlaskConical className="size-4" /> Demo
        {simOff && <WifiOff className="size-3.5 text-attention" />}
      </button>
      {open && (
        <div className="fixed bottom-32 left-3 z-50 w-[min(360px,calc(100vw-24px))] animate-rise rounded-2xl border border-line bg-surface p-4 shadow-pop lg:bottom-16 lg:left-[268px]">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <div className="font-semibold">Demo controls</div>
              <p className="text-xs text-muted">Presenter tools · not part of the product</p>
            </div>
            <IconButton label="Close" onClick={() => setOpen(false)} className="-mr-2 -mt-1">
              <X className="size-4" />
            </IconButton>
          </div>

          <Section title="Operation">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge tone={closed ? 'brand' : 'neutral'}>{closed ? 'Orders closed' : 'Orders open'}</Badge>
              <Badge tone={plan === 'PUBLISHED' ? 'success' : plan === 'DRAFT' ? 'warning' : 'neutral'}>Plan: {plan.toLowerCase()}</Badge>
            </div>
            <div className="grid gap-1.5">
              {plan === 'NONE' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    ops('closeOrders')
                    const r = ops('generatePlan')
                    toast('Plan generated', { body: `${r.served} served · ${r.deferred} deferred` })
                  }}
                >
                  Close orders & generate plan
                </Button>
              )}
              {plan === 'DRAFT' && (
                <Button size="sm" variant="secondary" onClick={() => (ops('publishPlan'), toast('Plan published'))}>
                  Publish plan to loaders & drivers
                </Button>
              )}
              {plan === 'PUBLISHED' && (
                <Button size="sm" variant="secondary" onClick={() => (ops('simulateFleet', 'VEH014'), toast('Fleet dispatched', { body: 'Other vehicles are now on the road' }))}>
                  Send the rest of the fleet out
                </Button>
              )}
            </div>
          </Section>

          <Section title="This device">
            <Toggle on={simOff} onChange={setOff} icon={simOff ? <WifiOff className="size-4" /> : <Wifi className="size-4" />} label="Simulate offline" hint="Only this tab loses connection" />
            <Toggle on={flaky} onChange={setFlaky} label="Unstable photo uploads" hint="Proof photos fail during sync" />
          </Section>

          <Section title="Sign in as">
            <div className="grid grid-cols-2 gap-1.5">
              {(['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER'] as Role[]).map((r) => (
                <button key={r} onClick={() => switchRole(r)} className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium', user?.role === r ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line hover:bg-surface-2')}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Tip: open another tab and sign in as a different role — both see one shared operation.</p>
          </Section>

          <Button
            size="sm"
            variant="ghost"
            block
            icon={<RotateCcw className="size-4" />}
            onClick={() => {
              if (!confirm('Reset the whole demo to the start of the day?')) return
              resetDemo()
              toast('Demo reset', { tone: 'info' })
              setOpen(false)
            }}
          >
            Reset demo data
          </Button>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 border-t border-line pt-3">
      <div className="eyebrow mb-2 !text-[10px]">{title}</div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange, label, hint, icon }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left">
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <span className={cn('relative h-5 w-9 rounded-full transition', on ? 'bg-attention' : 'bg-surface-3')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  )
}
