'use client'

import { useEffect, use } from 'react'
import { EditorBridge } from '@/components/studio/EditorBridge'
import { TerrainWorkspaceRoute } from '@/components/terrain/TerrainWorkspaceRoute'
import { useGraphStore } from '@/store/graph-store'
import { useCampusMapLookup } from '@/components/studio/useCampusMapLookup'

/** The separate terrain workspace ("Terrain" in Studio's top bar; "Done" returns to the map editor). */
export default function TerrainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const { campusMap, state } = useCampusMapLookup(id)

  useEffect(() => {
    if (currentMapId !== id) loadMapData(id)
  }, [id, currentMapId, loadMapData])

  if (!campusMap || currentMapId !== id) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        {campusMap || state === 'loading' ? 'Loading map…' : 'Map not found'}
      </div>
    )
  }

  return (
    <EditorBridge>
      <TerrainWorkspaceRoute mapId={id} />
    </EditorBridge>
  )
}
