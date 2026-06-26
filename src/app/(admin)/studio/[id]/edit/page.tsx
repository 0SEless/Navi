'use client'

import { useEffect, use } from 'react'
import { StudioWorkspace } from '@/components/studio/StudioWorkspace'
import { useGraphStore } from '@/store/graph-store'
import { useCampusMapStore } from '@/store/campus-map-store'

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const maps = useCampusMapStore((s) => s.maps)
  const campusMap = maps.find((m) => m.id === id)

  useEffect(() => {
    loadMapData(id)
  }, [id, loadMapData])

  if (!campusMap) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Map not found
      </div>
    )
  }

  return <StudioWorkspace mapId={id} />
}
