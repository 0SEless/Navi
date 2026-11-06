'use client'

import type maplibregl from 'maplibre-gl'
import type { CampusDocument, TerrainSampler } from '@navi/core'
import type { TerrainMapProps } from './TerrainMap'
import type { TerrainView } from '@/lib/terrain/terrain-view'
import { TerrainMap } from './TerrainMap'

/**
 * The one terrain map: flat (top view) to start; tilting it (right-drag, pinch or the 3D button)
 * raises the hill, buildings and stairs in place.
 */
export function TerrainStage({ document, sampler, version, view, exaggeration, onMainMap, layers, cutAboveFloorId, draft = null }: {
  document: CampusDocument
  sampler: TerrainSampler | null
  version: number
  view: TerrainView
  exaggeration: number
  onMainMap?: (map: maplibregl.Map | null) => void
  layers?: { buildings: boolean; roads: boolean; contours: boolean }
  cutAboveFloorId?: string | null
  draft?: TerrainMapProps['draft']
}) {
  return (
    <TerrainMap
      document={document} sampler={sampler} version={version} view={view} exaggeration={exaggeration}
      layers={layers} cutAboveFloorId={cutAboveFloorId} draft={draft} pitch={0} onMap={onMainMap}
    />
  )
}
