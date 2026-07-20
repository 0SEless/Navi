'use client'

import { useState, useCallback } from 'react'
import { useEditor, useEditingEngine, genId } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'
import type { LatLng } from '@/types/nav-types'

interface EntranceFormState {
  position: LatLng | null
  floor: number
  label: string
}

function pointInPolygon(position: LatLng, footprint: { lat: number; lng: number }[]): boolean {
  const { lat, lng } = position
  const pts = footprint
  if (!pts || pts.length < 3) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng, yi = pts[i].lat
    const xj = pts[j].lng, yj = pts[j].lat
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function findFloorId(building: { id: string; floors: { id: string; level: number }[] }, level: number): string | null {
  return building.floors.find((f) => f.level === level)?.id ?? null
}

export function useEntrancePlacer() {
  const [formState, setFormState] = useState<EntranceFormState | null>(null)
  const tool = useStudioStore((s) => s.tool)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)

  const { document, services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get('dispatcher')!
  const workflow = services.get('workflow')!

  const handleMapClick = useCallback((position: LatLng) => {
    if (tool !== 'entrance') return
    const buildings = document.buildings
    const hitBuilding = buildings.find((b) => {
      const pts = b.footprint?.points ?? []
      return pts.length >= 3 && pointInPolygon(position, pts)
    })
    if (hitBuilding) {
      setFormState({ position, floor: activeFloor, label: '' })
    }
  }, [tool, document.buildings, activeFloor])

  const confirmPlacement = useCallback(() => {
    if (!formState?.position) return
    const targetBuilding = activeBuildingId
      ? document.buildings.find((b) => b.id === activeBuildingId)
      : document.buildings.find((b) => pointInPolygon(formState.position!, b.footprint?.points ?? []))
    if (!targetBuilding) return

    const floorId = findFloorId(targetBuilding, formState.floor)
    if (!floorId) return

    const entranceId = genId('ent')
    editEngine.begin({ kind: 'create', entityType: 'entrance', geometry: formState.position!, properties: { label: formState.label || '', buildingId: targetBuilding.id, floorId } })
    editEngine.doCommit()
    dispatcher.execute({
      id: 'entrance.create',
      label: 'Create Entrance',
      payload: {
        id: entranceId,
        buildingId: targetBuilding.id,
        floorId,
        position: formState.position!,
        level: formState.floor,
        label: formState.label || '',
        type: 'side',
        hasQR: true,
        hasPanorama: false,
      },
    })
    workflow.save('manual')

    setFormState(null)
  }, [formState, document.buildings, activeBuildingId, editEngine, dispatcher, workflow])

  const cancelPlacement = useCallback(() => {
    setFormState(null)
  }, [])

  return {
    active: tool === 'entrance',
    pending: formState,
    handleMapClick,
    confirmPlacement,
    cancelPlacement,
    setFormState,
  }
}
