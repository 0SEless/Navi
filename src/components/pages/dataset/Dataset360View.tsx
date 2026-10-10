'use client'

import { useRouter } from 'next/navigation'
import { Camera } from 'lucide-react'
import type { CampusDocument, Panorama } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import type { DatasetSelection } from './types'
import { findBuilding, getPanoramasForScope, type ResolvedSelection } from './dataset-selectors'
import { tourWorkspaceHref } from '@/features/panorama-management/tour-selectors'

/** Read-only document scene inventory. Only consumes the dedicated Tour route. */
interface Dataset360ViewProps {
  campus: CampusMap
  document: CampusDocument | null
  selection: DatasetSelection
  resolved: ResolvedSelection
}

function panoramaContext(document: CampusDocument | null, panorama: Panorama): string {
  if (!panorama.buildingId) return 'Outdoor'
  const building = findBuilding(document, panorama.buildingId)
  if (!building) return `Building ${panorama.buildingId}`
  if (typeof panorama.floor !== 'number') return building.name
  const floor = building.floors.find(floor => floor.level === panorama.floor)
  return floor ? `${building.name} / ${floor.label}` : `${building.name} / Floor ${panorama.floor}`
}

function formatPosition(position: Panorama['position']): string {
  if (!position || typeof position !== 'object') return 'Not available'
  if ('lat' in position && 'lng' in position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) return `world ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
  if ('x' in position && 'y' in position && Number.isFinite(position.x) && Number.isFinite(position.y)) return `building-local ${position.x.toFixed(2)}, ${position.y.toFixed(2)} m`
  return 'Not available'
}

export function Dataset360View({ campus, document, selection, resolved }: Dataset360ViewProps) {
  const router = useRouter()
  if (resolved.missing) return null
  const panoramas = getPanoramasForScope(document, selection, resolved)
  // Group by stable authored scope identity, not labels that can collide.
  const groups = new Map<string, { label: string; scenes: Panorama[] }>()
  for (const scene of panoramas) {
    const key = JSON.stringify([scene.buildingId ?? null, scene.floor ?? null])
    const group = groups.get(key) ?? { label: panoramaContext(document, scene), scenes: [] }
    group.scenes.push(scene)
    groups.set(key, group)
  }
  const actionStyle = { border: '1px solid var(--navi-border)', borderRadius: 6, minHeight: 36, padding: '6px 10px', background: 'transparent', color: 'var(--navi-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as const

  return (
    <div data-content-type="360">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--navi-text)' }}>360 Scenes <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--navi-text-secondary)', marginLeft: 6 }}>{document ? panoramas.length : '—'}</span></h2>
        <button type="button" style={actionStyle} onClick={() => router.push(`/studio/${encodeURIComponent(campus.id)}/edit`)}>Edit Scenes in Studio</button>
      </div>
      {!document ? (
        <div style={{ padding: 24, border: '1px dashed var(--navi-border)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 13 }}>Virtual Tour dataset unavailable</p>
          <p style={{ fontSize: 12, color: 'var(--navi-text-secondary)' }}>The authored document is not available for this campus, so no scene records can be listed.</p>
        </div>
      ) : panoramas.length === 0 ? (
        <div style={{ padding: 24, border: '1px dashed var(--navi-border)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 13 }}>No Virtual Tour scenes for this selection</p>
          <p style={{ fontSize: 12, color: 'var(--navi-text-secondary)' }}>{selection.kind === 'outdoor' ? 'The dataset does not support scene associations for individual outdoor items.' : 'There are no authored scenes in this scope.'}</p>
        </div>
      ) : [...groups.entries()].map(([key, group]) => (
        <section key={key} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--navi-text-secondary)', marginBottom: 8, overflowWrap: 'anywhere' }}>{group.label} ({group.scenes.length})</h3>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none', border: '1px solid var(--navi-border)', borderRadius: 8, background: 'var(--navi-card)' }}>
            {group.scenes.map(scene => (
              <li key={scene.id} style={{ padding: 12, borderBottom: '1px solid var(--navi-border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <Camera size={14} aria-hidden="true" color="var(--navi-primary)" />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 80, overflowWrap: 'anywhere' }}>{scene.label || 'Untitled scene'}</span>
                  <span style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>{!scene.buildingId ? 'outdoor' : typeof scene.floor === 'number' ? `floor ${scene.floor}` : 'building'}</span>
                  <button type="button" aria-label={`Open ${scene.label || 'Untitled scene'} in Virtual Tour`} onClick={() => router.push(tourWorkspaceHref(campus.id, scene.id))} style={actionStyle}>Open scene</button>
                </div>
                <details style={{ marginTop: 8, fontSize: 11, color: 'var(--navi-text-secondary)', overflowWrap: 'anywhere' }}>
                  <summary style={{ cursor: 'pointer' }}>Scene details</summary>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 16px', marginTop: 8 }}>
                    <span>{`Context: ${panoramaContext(document, scene)}`}</span>
                    <span>{`Position: ${formatPosition(scene.position)}`}</span>
                    <span>{`Heading: ${typeof scene.heading === 'number' && Number.isFinite(scene.heading) ? `${scene.heading}°` : 'Not available'}`}</span>
                    <span>{`Image: ${typeof scene.imageAssetId === 'string' && scene.imageAssetId.trim() ? scene.imageAssetId.trim() : 'Not available'}`}</span>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p style={{ fontSize: 11, color: 'var(--navi-text-secondary)', lineHeight: 1.5 }}>Read-only dataset list — panorama playback, upload, and hotspot editing are not part of Dataset Management.</p>
    </div>
  )
}
