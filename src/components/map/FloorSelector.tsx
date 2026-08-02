'use client'

import React from 'react'

interface FloorSelectorProps {
  floors: number[]
  activeFloor: number
  onChange: (floor: number) => void
}

function formatFloorLabel(level: number): string {
  if (level === 0) return 'GF'
  if (level > 0) return `${level}F`
  return `B${Math.abs(level)}`
}

export function FloorSelector({ floors, activeFloor, onChange }: FloorSelectorProps) {
  if (!floors || floors.length <= 1) return null

  // Sort floors descending (top floor on top, ground floor at bottom)
  const sortedFloors = [...floors].sort((a, b) => b - a)

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--navi-card, #1E293B)',
        border: '1px solid var(--navi-border, #334155)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
    >
      {sortedFloors.map((level) => {
        const isActive = level === activeFloor
        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: 'none',
              background: isActive ? 'var(--navi-primary, #3B82F6)' : 'transparent',
              color: isActive ? '#FFFFFF' : 'var(--navi-text-secondary, #94A3B8)',
              fontWeight: isActive ? 600 : 400,
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title={`Switch to ${formatFloorLabel(level)}`}
          >
            {formatFloorLabel(level)}
          </button>
        )
      })}
    </div>
  )
}
