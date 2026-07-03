'use client'

import { useState, useCallback } from 'react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { LatLng, BuildingEntrance } from '@/types/nav-types'

interface EntranceFormState {
  position: LatLng | null
  floor: number
  label: string
}

export function useEntrancePlacer() {
  const [formState, setFormState] = useState<EntranceFormState | null>(null)
  const tool = useStudioStore((s) => s.tool)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const graph = useGraphStore((s) => s.graph)
  const updateBuilding = useGraphStore((s) => s.updateBuilding)
  const save = useGraphStore((s) => s.save)
  const addNode = useGraphStore((s) => s.addNode)
  const handleMapClick = useCallback((position: LatLng) => {
    if (tool !== 'entrance') return
    // Find which building this click falls within
    const buildings = graph.buildings
    const hitBuilding = buildings.find((b) => {
      if (!b.footprint || b.footprint.length < 3) return false
      // Simple point-in-polygon test
      const { lat, lng } = position
      const pts = b.footprint
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].lng, yi = pts[i].lat
        const xj = pts[j].lng, yj = pts[j].lat
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside
        }
      }
      return inside
    })
    if (hitBuilding) {
      setFormState({ position, floor: activeFloor, label: '' })
    }
  }, [tool, graph.buildings, activeFloor])

  const confirmPlacement = useCallback(() => {
    if (!formState?.position) return
    const targetBuilding = activeBuildingId
      ? graph.buildings.find((b) => b.id === activeBuildingId)
      : graph.buildings.find((b) => {
          const { lat, lng } = formState.position!
          const pts = b.footprint
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
        })
    if (!targetBuilding) return

    const entranceId = `ent-${Date.now()}`
    const entrance: BuildingEntrance = {
      id: entranceId,
      position: formState.position!,
      floor: formState.floor,
      label: formState.label || undefined,
    }

    const existing = targetBuilding.entrances ?? []
    updateBuilding(targetBuilding.id, { entrances: [...existing, entrance] })
    save()

    // Also create a NavNode for routing
    addNode({
      id: entranceId,
      label: formState.label || `Entrance (${targetBuilding.name})`,
      name: formState.label || `Entrance ${targetBuilding.name}`,
      position: formState.position!,
      floor: formState.floor,
      buildingId: targetBuilding.id,
      campusId: targetBuilding.campusId,
      type: 'building_entrance',
    })
    save()

    setFormState(null)
  }, [formState, graph.buildings, activeBuildingId, updateBuilding, save, addNode])

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
