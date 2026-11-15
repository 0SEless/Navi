'use client'

import { useRef } from 'react'
import type { ProfileSlice } from '@/lib/terrain/profile-slice'

/**
 * Side view (owner 2026-11-15): the selected mesh line or road seen from the side. Grey dashes = the ground before,
 * blue = the result; drag a point straight up or down (or use the arrow keys) to set its height.
 */
const W = 600
const H = 130
const PAD = 22
const round = (v: number) => Math.round(v * 100) / 100

export function ProfileStrip({ slice, onDragHandle, title }: {
  slice: ProfileSlice
  onDragHandle: (key: string, heightM: number) => void
  title?: string
}) {
  const all = [...slice.before, ...slice.after, ...slice.handles].map((p) => p.h)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const range = Math.max(1, hi - lo)
  const min = lo - range * 0.15
  const max = hi + range * 0.15
  const metresPerPx = (max - min) / (H - 2 * PAD)
  const x = (s: number) => PAD + ((W - 2 * PAD) * s) / Math.max(1e-6, slice.lengthM)
  const y = (h: number) => H - PAD - (h - min) / metresPerPx
  const line = (pts: Array<{ s: number; h: number }>) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)} ${y(p.h).toFixed(1)}`).join(' ')
  const drag = useRef<{ key: string; startY: number; startH: number } | null>(null)

  return (
    <div aria-label={title ?? 'Side view'} style={{ background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, padding: 6 }}>
      {title && <div style={{ fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)', marginBottom: 2 }}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'none' }}>
        <path d={line(slice.before)} fill="none" stroke="#9ca3af" strokeDasharray="4 4" strokeWidth={1.5} />
        <path d={line(slice.after)} fill="none" stroke="#534AB7" strokeWidth={2.5} />
        {slice.handles.map((handle) => (
          <g key={handle.key}>
            <text x={x(handle.s)} y={y(handle.h) - 11} textAnchor="middle" fontSize={11} fill="#374151">{`${handle.h.toFixed(2)} m`}</text>
            <circle
              role="slider" tabIndex={0} aria-label={`Height at ${Math.round(handle.s)} m`}
              aria-valuenow={handle.h.toFixed(2) as unknown as number} aria-valuetext={`${handle.h.toFixed(2)} m`}
              cx={x(handle.s)} cy={y(handle.h)} r={7} fill="#fff" stroke="#3C3489" strokeWidth={2} style={{ cursor: 'ns-resize' }}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 1 : 0.1
                if (event.key === 'ArrowUp') { event.preventDefault(); onDragHandle(handle.key, round(handle.h + step)) }
                if (event.key === 'ArrowDown') { event.preventDefault(); onDragHandle(handle.key, round(handle.h - step)) }
              }}
              onPointerDown={(event) => {
                drag.current = { key: handle.key, startY: event.clientY, startH: handle.h }
                ;(event.target as Element).setPointerCapture?.(event.pointerId)
              }}
              onPointerMove={(event) => {
                const d = drag.current
                if (!d || d.key !== handle.key) return
                onDragHandle(d.key, round(d.startH + (d.startY - event.clientY) * metresPerPx))
              }}
              onPointerUp={() => { drag.current = null }}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}
