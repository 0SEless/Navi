'use client'

import { useState, type ReactNode } from 'react'
import type { CampusDocument } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { TerrainTopBar } from './TerrainTopBar'
import type { TerrainLockState } from './useTerrainLock'

export type SaveResult = { ok: true } | { ok: false; message: string }

export interface TerrainWorkspaceProps {
  document: CampusDocument
  /** Runs an editor command (one undo step). */
  dispatch: (command: Command) => MutationResult | undefined
  lock: TerrainLockState
  /** Saves terrain changes (Save v2 explicit save). */
  onSave: () => Promise<SaveResult>
  /** Goes back to the map editor. */
  onLeave: () => void
  /** Top-bar controls added by later tasks (views, exaggeration). */
  topBarExtras?: ReactNode
  /** The terrain map (Task 7) and tool panels. */
  children?: ReactNode
  /** No boundary in the document or the campus settings (section 5). */
  missingBoundary?: boolean
}

/** The separate terrain environment: top bar, lock banner, first visit, and the map area. */
export function TerrainWorkspace({ document, lock, onSave, onLeave, topBarExtras, children, missingBoundary = false }: TerrainWorkspaceProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const done = async () => {
    setSaving(true)
    setMessage(null)
    const result = await onSave().catch((error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : 'Could not save.' }))
    setSaving(false)
    if (result.ok) onLeave()
    else setMessage(result.message)
  }

  return (
    <div data-terrain-workspace="true" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--navi-bg, #f8fafc)' }}>
      <TerrainTopBar terrain={document.terrain} saving={saving} onDone={() => void done()} extras={topBarExtras} />
      {lock.status === 'view-only' && (
        <div role="status" style={{ padding: '6px 14px', fontSize: 12, background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
          {`${lock.holderName ?? 'Another admin'} is editing the terrain. You can look, but not change it.`}
        </div>
      )}
      {missingBoundary && (
        <div role="status" style={{ padding: '6px 14px', fontSize: 12, background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
          This map has no campus boundary yet. Draw it in the main editor with Set Campus Boundary.
        </div>
      )}
      {message && (
        <div role="alert" style={{ padding: '6px 14px', fontSize: 12, background: '#fee2e2', color: '#991b1b', borderBottom: '1px solid #fecaca' }}>
          {message}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}
