'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import { FLOOR_PIECE_COLORS } from '@/components/map/layers/FloorArchitectureLayer'
import { styleReady } from '@/lib/terrain/style-ready'
import type { WholeBuildingKind, WholeBuildingPieces } from './whole-building'

const KINDS: WholeBuildingKind[] = ['floors', 'walls', 'frames', 'panels', 'stairs', 'glass', 'warnings']
const COLOR: Record<WholeBuildingKind, string> = { floors: FLOOR_PIECE_COLORS.floor, walls: FLOOR_PIECE_COLORS.walls, frames: FLOOR_PIECE_COLORS.frames, panels: FLOOR_PIECE_COLORS.panels, stairs: FLOOR_PIECE_COLORS.stairs, glass: FLOOR_PIECE_COLORS.glass, warnings: '#dc2626' }
/** The floors you are not editing are faded (owner 2026-11-16: "active floor, others faded"). */
export const WHOLE_BUILDING_OPACITY = 0.25
const id = (kind: WholeBuildingKind) => `whole-building-${kind}`
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Draws the floors above the edited floor, faded, in the floor editor's 2.5D view. Never takes pointer input. */
export function WholeBuildingLayer({ map, pieces, on }: { map: maplibregl.Map | null; pieces: WholeBuildingPieces | null; on: boolean }) {
  useEffect(() => {
    if (!map || !on) return
    const add = () => {
      if (!styleReady(map)) return
      for (const kind of KINDS) {
        if (!map.getSource(id(kind))) map.addSource(id(kind), { type: 'geojson', data: EMPTY })
        if (!map.getLayer(id(kind))) {
          map.addLayer({ id: id(kind), type: 'fill-extrusion', source: id(kind), paint: {
            'fill-extrusion-color': COLOR[kind], 'fill-extrusion-opacity': kind === 'warnings' ? 0.85 : WHOLE_BUILDING_OPACITY,
            'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'],
          } })
        }
      }
    }
    add()
    map.on('style.load', add)
    return () => {
      map.off('style.load', add)
      try {
        for (const kind of KINDS) {
          if (map.getLayer(id(kind))) map.removeLayer(id(kind))
          if (map.getSource(id(kind))) map.removeSource(id(kind))
        }
      } catch { /* map already removed */ }
    }
  }, [map, on])

  useEffect(() => {
    if (!map || !on) return
    for (const kind of KINDS) (map.getSource(id(kind)) as maplibregl.GeoJSONSource | undefined)?.setData(pieces?.[kind] ?? EMPTY)
  }, [map, on, pieces])

  return null
}

/** The whole-building switch and a show/hide box per floor above, shown over the 2.5D view. */
export function WholeBuildingControls({ floorsAbove, on, hidden, onToggle, onToggleFloor }: {
  floorsAbove: ReadonlyArray<{ level: number; label: string }>
  on: boolean
  hidden: ReadonlySet<number>
  onToggle(on: boolean): void
  onToggleFloor(level: number): void
}) {
  return (
    <div data-testid="whole-building-controls" style={{
      position: 'absolute', top: 40, right: 8, zIndex: 5, background: 'var(--navi-content, #fff)', color: 'var(--navi-text, #111)',
      border: '1px solid var(--navi-border, #ccc)', borderRadius: 6, padding: '6px 8px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
        <input type="checkbox" aria-label="Whole building" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        Whole building
      </label>
      {on && (floorsAbove.length === 0
        ? <span style={{ color: 'var(--navi-text-secondary, #666)' }}>No floor above this one</span>
        : floorsAbove.map((f) => (
          <label key={f.level} style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 12 }}>
            <input type="checkbox" aria-label={`Show ${f.label}`} checked={!hidden.has(f.level)} onChange={() => onToggleFloor(f.level)} />
            {f.label}
          </label>
        )))}
    </div>
  )
}
