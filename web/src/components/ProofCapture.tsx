import { Camera, Eraser, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

/** Downscale to a small JPEG so proofs stay light enough to queue offline. */
async function shrink(file: File, max = 480): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const r = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * r)
    c.height = Math.round(img.height * r)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.6)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function PhotoCapture({ value, onChange, label = 'Take photo' }: { value?: string; onChange: (v?: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="Captured proof" className="size-20 rounded-lg border border-line object-cover" />
      ) : (
        <span className="grid size-20 place-items-center rounded-lg border border-dashed border-line-strong text-faint">
          <ImageIcon className="size-6" />
        </span>
      )}
      <div className="flex flex-col gap-2">
        <Button type="button" variant="secondary" icon={<Camera className="size-4" />} onClick={() => input.current?.click()}>
          {value ? 'Retake' : label}
        </Button>
        {value && (
          <button type="button" className="text-left text-xs text-muted underline" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) onChange(await shrink(f))
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function SignaturePad({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(!!value)
  const [dirty, setDirty] = useState(!!value)

  useEffect(() => {
    const c = ref.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  return (
    <div>
      <canvas
        ref={ref}
        aria-label="Signature pad"
        className="h-32 w-full touch-none rounded-lg border border-line-strong bg-surface"
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = ref.current!.getContext('2d')!
          ctx.beginPath()
          ctx.moveTo(...pos(e))
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = ref.current!.getContext('2d')!
          ctx.lineTo(...pos(e))
          ctx.stroke()
          hasInk.current = true
          setDirty(true)
        }}
        onPointerUp={() => {
          drawing.current = false
          if (hasInk.current) onChange(ref.current!.toDataURL('image/png'))
        }}
      />
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{dirty ? 'Signed' : 'Sign with your finger'}</span>
        {dirty && (
          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            onClick={() => {
              const c = ref.current!
              c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
              hasInk.current = false
              setDirty(false)
              onChange(undefined)
            }}
          >
            <Eraser className="size-3" /> Clear
          </button>
        )}
      </div>
    </div>
  )
}
