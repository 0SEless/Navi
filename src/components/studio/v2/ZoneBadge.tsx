'use client'

import type { ZoneLockView } from '@/studio-v2/server/types'

/** Small "🔒 Ana" marker next to a building that another admin is editing. */
export function ZoneBadge({ lock }: { lock: ZoneLockView }) {
  return (
    <span
      data-testid="zone-badge"
      title={`${lock.holderName ?? 'Another admin'} is currently editing this building`}
      style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 4, padding: '0 4px', flexShrink: 0 }}
    >
      {`🔒 ${lock.holderName ?? 'Locked'}`}
    </span>
  )
}
