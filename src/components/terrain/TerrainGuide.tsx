'use client'

import { useEffect, useState } from 'react'
import { primaryButton, secondaryButton } from './form-styles'

const STEPS = [
  'Layers — turn the street map, ground, buildings and more on or off on the left.',
  'Tools — shape the ground with the dock at the bottom. Each tool has a letter key.',
  'Import terrain — bring in a TopoExport .glb with its frame.geojson for real heights.',
  'Done — saves your terrain and goes back to the editor.',
]
/** Where each step points (the layers panel, the dock, Import terrain at the dock's end, Done top right). */
const PLACES: React.CSSProperties[] = [
  { left: 256, top: 24 },
  { left: '50%', bottom: 64, transform: 'translateX(-50%)' },
  { left: '50%', bottom: 64, transform: 'translateX(10%)' },
  { right: 16, top: 12 },
]
const STORAGE_KEY = 'navi-terrain-guide-seen'

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** True once the guide has been closed in this browser; unreadable storage means not seen. */
export function guideSeen(storage: Storage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen(storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, '1')
  } catch {
    // Blocked storage: the guide shows again next time.
  }
}

/** Section 5: four short steps on first open; the "?" button replays them. */
export function TerrainGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => { if (open) setStep(0) }, [open])
  if (!open) return null
  const last = step === STEPS.length - 1
  return (
    <div role="dialog" aria-label="Terrain guide" style={{
      position: 'absolute', zIndex: 5, width: 300, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13,
      background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-primary, #2563eb)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
      ...PLACES[step],
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navi-text-secondary, #6b7280)' }}>Step {step + 1} of {STEPS.length}</div>
      <div>{STEPS[step]}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={secondaryButton} onClick={onClose}>Skip</button>
        {step > 0 && <button type="button" style={secondaryButton} onClick={() => setStep(step - 1)}>Back</button>}
        {last
          ? <button type="button" style={primaryButton} onClick={onClose}>Done</button>
          : <button type="button" style={primaryButton} onClick={() => setStep(step + 1)}>Next</button>}
      </div>
    </div>
  )
}
