'use client'

import type { ZoneDenial } from '@/studio-v2/server/types'
import { denialMessage } from '@/studio-v2/client/zone-client'

interface ZoneDeniedDialogProps {
  denial: ZoneDenial
  isOwner: boolean
  onClose: () => void
  onForceRelease: () => void
  closeLabel?: string
}

/** "Ana is currently editing this building — try editing other buildings." (owner copy). */
export function ZoneDeniedDialog({ denial, isOwner, onClose, onForceRelease, closeLabel = 'OK' }: ZoneDeniedDialogProps) {
  const canForce = isOwner && !denial.sameActor
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="zone-denied-message"
      data-testid="zone-denied-dialog"
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.35)', zIndex: 1000 }}
    >
      <div style={{ background: '#fff', borderRadius: 8, padding: 20, maxWidth: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <p id="zone-denied-message" style={{ margin: '0 0 16px', fontSize: 14 }}>{denialMessage(denial)}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {canForce && (
            <button
              type="button"
              onClick={() => {
                const name = denial.holderName ?? 'This admin'
                if (window.confirm(`${name} may lose unsaved work on this computer.`)) onForceRelease()
              }}
            >
              Release lock
            </button>
          )}
          <button type="button" onClick={onClose} autoFocus>{closeLabel}</button>
        </div>
      </div>
    </div>
  )
}
