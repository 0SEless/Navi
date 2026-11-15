'use client'

import { useState } from 'react'
import { removeSpikes, type CampusDocument } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'

/**
 * Terrain list (owner 2026-11-15): everything that shapes the ground, in priority order (higher wins where they
 * overlap): Buildings > Roads > Meshes (later in the list wins) > Sculpting > Original ground. Each item can be
 * opened for editing, hidden in Studio's view (publishing always includes it), moved, merged or deleted.
 */
export interface TerrainListPanelProps {
  document: CampusDocument
  editing: boolean
  dispatch: (command: Command) => MutationResult | undefined
  onOpenMesh: (meshId: string) => void
  onOpenRoad: (roadId: string) => void
}

const head: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--navi-text, #111827)', marginTop: 6 }
const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, paddingLeft: 10 }
const icon: React.CSSProperties = { padding: '0 4px', fontSize: 11, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--navi-text-secondary, #6b7280)' }
const name: React.CSSProperties = { ...icon, flex: 1, textAlign: 'left', color: 'var(--navi-text, #111827)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

export function TerrainListPanel({ document, editing, dispatch, onOpenMesh, onOpenRoad }: TerrainListPanelProps) {
  const [askClear, setAskClear] = useState(false)
  const [spikeNote, setSpikeNote] = useState<string | null>(null)
  const meshes = document.terrain?.meshes ?? []
  const roads = document.roads ?? []
  const send = (id: string, label: string, payload: Record<string, unknown>) => dispatch({ id, label, payload })
  const hasSculpting = Object.keys(document.terrainTiles ?? {}).length > 0
  const sculptingHidden = document.terrain?.sculptingHidden === true

  return (
    <section aria-label="Terrain list" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)' }}>Higher wins where they overlap</div>
      <div style={head}>Buildings ({(document.buildings ?? []).length})</div>
      <div style={head}>Roads ({roads.length})</div>
      {roads.filter((r) => r.grade || (r.groundFit && r.groundFit.mode !== 'off')).map((r) => (
        <div key={r.id} style={item}>
          <button type="button" style={name} aria-label={`Edit ${r.name || r.id}`} onClick={() => onOpenRoad(r.id)}>{`${r.name || r.id} · graded`}</button>
        </div>
      ))}
      <div style={head}>Meshes ({meshes.length})</div>
      {meshes.map((m, i) => (
        <div key={m.id} style={item}>
          <button type="button" style={name} aria-label={`Edit ${m.name}`} onClick={() => onOpenMesh(m.id)} disabled={!editing}>{m.name}</button>
          <button type="button" style={icon} disabled={!editing} aria-label={`${m.hidden ? 'Show' : 'Hide'} ${m.name}`} onClick={() => send('terrain.set-view', m.hidden ? 'Show mesh' : 'Hide mesh', { meshId: m.id, hidden: !m.hidden })}>{m.hidden ? 'show' : 'hide'}</button>
          <button type="button" style={icon} disabled={!editing || i === 0} aria-label={`Move ${m.name} up`} onClick={() => send('terrain.mesh.reorder', 'Move mesh', { meshId: m.id, toIndex: i - 1 })}>▲</button>
          <button type="button" style={icon} disabled={!editing || i === meshes.length - 1} aria-label={`Move ${m.name} down`} onClick={() => send('terrain.mesh.reorder', 'Move mesh', { meshId: m.id, toIndex: i + 1 })}>▼</button>
          <button type="button" style={icon} disabled={!editing} aria-label={`Merge ${m.name} into ground`} title="Merge into ground" onClick={() => send('terrain.mesh.merge', 'Merge mesh into ground', { meshId: m.id })}>merge</button>
          <button type="button" style={{ ...icon, color: '#b91c1c' }} disabled={!editing} aria-label={`Delete ${m.name}`} onClick={() => send('terrain.mesh.remove', 'Delete mesh', { meshId: m.id })}>✕</button>
        </div>
      ))}
      <div style={{ ...head, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1 }}>Sculpting{hasSculpting ? '' : ' (none)'}</span>
        <button type="button" style={icon} disabled={!editing} aria-label={`${sculptingHidden ? 'Show' : 'Hide'} sculpting`} onClick={() => send('terrain.set-view', sculptingHidden ? 'Show sculpting' : 'Hide sculpting', { sculptingHidden: !sculptingHidden })}>{sculptingHidden ? 'show' : 'hide'}</button>
        <button type="button" style={icon} disabled={!editing || !hasSculpting} aria-label="Remove spikes"
          title="Put broken sculpting (cells far outside the hill) back in line with the ground around it"
          onClick={() => {
            // One undo step (owner 2026-11-15: a brush bug left −251 m … +65 m spikes beside buildings).
            const { tiles, cells } = removeSpikes(document.terrainTiles ?? {})
            if (cells > 0) send('terrain.apply-tiles', 'Remove spikes', { tiles })
            setSpikeNote(cells > 0 ? `Fixed ${cells} cell${cells === 1 ? '' : 's'}.` : 'No spikes found.')
          }}>spikes</button>
        <button type="button" style={{ ...icon, color: '#b91c1c' }} disabled={!editing || !hasSculpting} aria-label="Clear sculpting" onClick={() => setAskClear(true)}>clear</button>
      </div>
      {spikeNote && <div role="status" style={{ ...item, color: 'var(--navi-text-secondary, #6b7280)' }}>{spikeNote}</div>}
      {askClear && (
        <div role="alertdialog" aria-label="Clear sculpting" style={{ ...item, flexWrap: 'wrap' }}>
          <span>Remove every painted change? You can undo it.</span>
          <button type="button" style={{ ...icon, color: '#b91c1c' }} onClick={() => { send('terrain.sculpting.clear', 'Clear sculpting', {}); setAskClear(false) }}>Yes, clear</button>
          <button type="button" style={icon} onClick={() => setAskClear(false)}>Keep</button>
        </div>
      )}
      <div style={head}>Original ground</div>
    </section>
  )
}
