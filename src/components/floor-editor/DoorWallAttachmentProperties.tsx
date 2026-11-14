'use client'

import { useState } from 'react'
import type { Floor, RoomDoor } from '@navi/core'
import { validateDoorWallAttachment, deriveAttachedDoor } from '@navi/editor'

type Attachment = NonNullable<RoomDoor['wallAttachment']>
interface Props {
  floor: Floor
  door: RoomDoor
  disabled?: boolean
  onUpdate(patch: { wallAttachment: Attachment }): { success: boolean; error?: string }
}

/** Explicit conversion of an existing Door; choosing and previewing a host never edits data. */
export function DoorWallAttachmentProperties({ floor, door, disabled = false, onUpdate }: Props) {
  const [wallId, setWallId] = useState(door.wallAttachment?.wallId ?? '')
  const [offset, setOffset] = useState(door.wallAttachment ? String(door.wallAttachment.offset) : '')
  const [height, setHeight] = useState(String(door.wallAttachment?.openingHeight ?? 2.1))
  const [preview, setPreview] = useState<{ door: RoomDoor; attachment: Attachment; signature: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const signature = JSON.stringify([door, floor.walls, floor.openings, floor.doors, floor.windows])
  const currentPreview = preview?.signature === signature ? preview : null
  const host = floor.walls?.find(wall => wall.id === currentPreview?.attachment.wallId)
  const hostLength = host ? Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y) : 1
  const reset = () => { setPreview(null); setError(null); setApplied(false) }
  const prepare = () => {
    if (!wallId || !offset.trim() || !height.trim() || !Number.isFinite(Number(offset)) || !Number.isFinite(Number(height))) {
      setError('Choose a host wall and enter a finite center distance and opening height.'); setPreview(null); return null
    }
    const attachment = { wallId, offset: Number(offset), openingHeight: Number(height) }
    const checked = validateDoorWallAttachment(floor, { ...door, wallAttachment: attachment })
    if (!checked.ok) { setError(checked.error); setPreview(null); return null }
    const wall = floor.walls!.find(candidate => candidate.id === wallId)!
    return { attachment, door: deriveAttachedDoor(checked.door, wall), signature }
  }
  const inputStyle = { width: '100%', minHeight: 36, boxSizing: 'border-box' as const, background: 'var(--navi-content)', color: 'var(--navi-text)', border: '1px solid var(--navi-border)', borderRadius: 4, padding: 6 }
  return <section aria-label="Door wall attachment" style={{ padding: 12, fontSize: 12, borderTop: '1px solid var(--navi-border)' }}>
    <strong>Attach Door to Wall</strong>
    <p>Select the wall that contains this doorway. Preview the alignment before applying.</p>
    <label style={{ display: 'block', marginTop: 10 }}>Host wall
      <select aria-label="Host wall" value={wallId} disabled={disabled} style={inputStyle} onChange={event => { reset(); setWallId(event.target.value) }}>
        <option value="">Choose a wall</option>
        {(floor.walls ?? []).map(wall => <option key={wall.id} value={wall.id}>{wall.id} ({Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y).toFixed(2)} m)</option>)}
      </select>
    </label>
    <label style={{ display: 'block', marginTop: 10 }}>Door center from wall start (m)
      <input aria-label="Door center from wall start (m)" type="number" min="0" step="any" value={offset} disabled={disabled} style={inputStyle} onChange={event => { reset(); setOffset(event.target.value) }} />
    </label>
    <label style={{ display: 'block', marginTop: 10 }}>Door opening height (m)
      <input aria-label="Door opening height (m)" type="number" min="0" step="any" value={height} disabled={disabled} style={inputStyle} onChange={event => { reset(); setHeight(event.target.value) }} />
    </label>
    <button type="button" disabled={disabled} style={{ minHeight: 44, width: '100%', marginTop: 12 }} onClick={() => { if (disabled) return; setError(null); setApplied(false); setPreview(prepare()) }}>Preview attachment</button>
    {currentPreview && host && <div>
      <svg aria-label="Door attachment preview" role="img" viewBox="0 0 240 80" style={{ width: '100%', marginTop: 10, background: '#EFF6FF', borderRadius: 4 }}>
        <line x1="20" x2="220" y1="40" y2="40" stroke="#64748B" strokeWidth="8" />
        <rect x={20 + (currentPreview.attachment.offset - door.width / 2) / hostLength * 200} y="28" width={door.width / hostLength * 200} height="24" fill="#14B8A6" stroke="#0F766E" />
        <text x="20" y="68" fontSize="10" fill="#334155">Wall start</text>
      </svg>
      <p>Center: {currentPreview.door.position.x.toFixed(2)}, {currentPreview.door.position.y.toFixed(2)} m</p>
      <p>Orientation: {((currentPreview.door.rotation ?? 0) * 180 / Math.PI).toFixed(1)} degrees  /  Width: {door.width.toFixed(2)} m</p>
      <p>Preview only. Room ownership and route connection stay assigned.</p>
    </div>}
    {error && <p role="alert" style={{ color: '#DC2626' }}>{error}</p>}
    {applied && <p role="status">Attachment applied to the working draft.</p>}
    <button type="button" disabled={disabled || !currentPreview} style={{ minHeight: 44, width: '100%', marginTop: 10 }} onClick={() => {
      if (disabled || !currentPreview) return
      const checked = prepare()
      if (!checked) return
      try {
        const result = onUpdate({ wallAttachment: checked.attachment })
        if (!result.success) { setError(result.error ?? 'The attachment could not be applied.'); return }
        setError(null); setApplied(true); setPreview(null)
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'The attachment could not be applied.') }
    }}>Apply attachment</button>
    <p style={{ fontSize: 10 }}>Applies to the working draft. Campus Save is separate.</p>
  </section>
}
