'use client'

import type { Route } from '@navi/runtime'

interface Props {
  route: Route | null
  onClose: () => void
}

const iconMap: Record<string, string> = {
  walk: '\u{1F6B6}', turn_left: '\u{2190}', turn_right: '\u{2192}',
  stairs: '\u{1F4E2}', elevator: '\u{1F6D7}', arrive: '\u{1F3C1}',
}

export function InstructionPanel({ route, onClose }: Props) {
  if (!route) return null

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 320,
      background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      padding: 16, zIndex: 10, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>{route.fromLabel} &rarr; {route.toLabel}</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>&times;</button>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
        {Math.round(route.totalDistance)}m &middot; {Math.round(route.totalDuration / 60)} min
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {route.instructions.map((inst, i) => (
          <li key={i} style={{
            display: 'flex', gap: 10, padding: '8px 0',
            borderBottom: i < route.instructions.length - 1 ? '1px solid #f3f4f6' : 'none',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{iconMap[inst.type] ?? '\u{1F6B6}'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{inst.text}</div>
              {inst.distance > 0 && (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{Math.round(inst.distance)}m</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
