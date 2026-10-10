'use client'

import { useEffect, use, useState } from 'react'
import { StudioWorkspace } from '@/components/studio/StudioWorkspace'
import { EditorBridge } from '@/components/studio/EditorBridge'
import { useGraphStore } from '@/store/graph-store'
import { useCampusMapStore } from '@/store/campus-map-store'
import { resolveStudioCampusMap, TEST_CAMPUS_ID } from '@/lib/studio/test-campus-catalog'
import { TestCampusCatalogOptIn } from '@/components/studio/TestCampusCatalogOptIn'
import { TestCampusPanoramaAuthoring } from '@/components/studio/TestCampusPanoramaAuthoring'

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const maps = useCampusMapStore((s) => s.maps)
  const [browserReady, setBrowserReady] = useState(false)

  useEffect(() => setBrowserReady(true), [])

  const campusMap = maps.find((map) => map.id === id)
    ?? (browserReady ? resolveStudioCampusMap(id, maps) : undefined)

  useEffect(() => {
    if (currentMapId !== id) {
      loadMapData(id)
    }
  }, [id, currentMapId, loadMapData])

  if (!campusMap) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        <div>Map not found</div>
        {process.env.NODE_ENV === 'development' && <TestCampusCatalogOptIn campusId={id} />}
      </div>
    )
  }

  // EditorBridge builds the editor document ONCE from the graph at mount.
  // Wait until loadMapData has populated the graph store for this map,
  // otherwise the document is created from the empty initial graph and
  // the map renders blank.
  if (currentMapId !== id) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Loading map…
      </div>
    )
  }

  return (
    <EditorBridge>
      <StudioWorkspace mapId={id} center={campusMap.center} />
      {process.env.NODE_ENV === 'development' && id === TEST_CAMPUS_ID && <TestCampusPanoramaAuthoring campusId={id} />}
    </EditorBridge>
  )
}
