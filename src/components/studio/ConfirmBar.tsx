'use client'

import { Trash2, Check, X } from 'lucide-react'

interface ConfirmBarProps {
  tracePoints: Array<{ lat: number; lng: number }>
  drawPoints: Array<{ lat: number; lng: number }>
  routeWidth: number
  tool: 'route' | 'building' | 'boundary'
  canConfirm: boolean
  onConfirm: () => void
  onCancel: () => void
  onUndo: () => void
  onSetWidth: (width: number) => void
  toolLabel: string
}

export function ConfirmBar({
  tracePoints,
  drawPoints,
  routeWidth,
  tool,
  canConfirm,
  onConfirm,
  onCancel,
  onUndo,
  onSetWidth,
  toolLabel,
}: ConfirmBarProps) {
  const currentPoints = tool === 'route' ? tracePoints : drawPoints
  const minPoints = tool === 'route' ? 2 : 3

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 6, background: '#1E293B', borderRadius: 8, padding: '4px 6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10, alignItems: 'center',
    }}>
      <span style={{
        fontSize: 10, color: '#06B6D4',
        padding: '0 4px', fontWeight: 600, whiteSpace: 'nowrap',
      }}>
        {toolLabel}
      </span>
      <span style={{ fontSize: 10, color: '#94A3B8', padding: '0 4px' }}>
        {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''} (need {minPoints})
      </span>
      {tool === 'route' && (
        <>
          <button onClick={() => onSetWidth(routeWidth - 1)}
            style={{
              width: 24, height: 24, borderRadius: 4, border: 'none',
              background: '#475569', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >−</button>
          <span style={{ fontSize: 10, color: '#06B6D4', fontWeight: 600, minWidth: 16, textAlign: 'center' }}>
            {routeWidth}
          </span>
          <button onClick={() => onSetWidth(routeWidth + 1)}
            style={{
              width: 24, height: 24, borderRadius: 4, border: 'none',
              background: '#475569', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >+</button>
        </>
      )}
      <button onClick={onUndo} disabled={currentPoints.length < 1} aria-label="Undo"
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 6,
          border: 'none', background: currentPoints.length < 1 ? '#374151' : '#475569',
          color: currentPoints.length < 1 ? '#6B7280' : '#fff', fontSize: 11,
          cursor: currentPoints.length < 1 ? 'not-allowed' : 'pointer',
        }}
      >
        <Trash2 size={12} />
      </button>
      <button onClick={onConfirm} disabled={!canConfirm}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
          border: 'none', background: !canConfirm ? '#374151' : '#10B981',
          color: !canConfirm ? '#6B7280' : '#fff', fontSize: 11,
          cursor: !canConfirm ? 'not-allowed' : 'pointer',
        }}
      >
        <Check size={12} /> Confirm
      </button>
      <button onClick={onCancel}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
          border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer',
        }}
      >
        <X size={12} /> Cancel
      </button>
    </div>
  )
}
