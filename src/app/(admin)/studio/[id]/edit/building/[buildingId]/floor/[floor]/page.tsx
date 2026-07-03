'use client'

import { useEffect, use } from 'react'
import { FloorEditor } from '@/components/floor-editor/FloorEditor'
import { useGraphStore } from '@/store/graph-store'

export default function FloorEditorPage({ params }: { params: Promise<{ id: string; buildingId: string; floor: string }> }) {
  const { id: mapId, buildingId, floor: floorStr } = use(params)
  const floor = parseInt(floorStr, 10)
  const loadMapData = useGraphStore((s) => s.loadMapData)

  useEffect(() => {
    loadMapData(mapId)
  }, [mapId, loadMapData])

  return <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
}
