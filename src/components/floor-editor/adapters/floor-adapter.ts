'use client'

import { useEffect } from 'react'
import type { Viewport } from '@navi/editor'
import type { Building } from '@/types/nav-types'

const FLOOR_ID_PREFIX = 'flr-'

function indexToId(floors: number[], idx: number): string | null {
  if (idx < 0 || idx >= floors.length) return null
  return `${FLOOR_ID_PREFIX}${floors[idx]}`
}

function idToIndex(floors: number[], id: string | null): number {
  if (!id || !id.startsWith(FLOOR_ID_PREFIX)) return 0
  const level = parseInt(id.slice(FLOOR_ID_PREFIX.length), 10)
  const idx = floors.indexOf(level)
  return idx >= 0 ? idx : 0
}

export function useFloorAdapter(
  viewport: Viewport,
  building: Building | null,
  floorIndex: number,
) {
  const floors = building?.floors ?? []

  useEffect(() => {
    const id = indexToId(floors, floorIndex)
    if (id && id !== viewport.activeFloorId) {
      viewport.setActiveFloor(id)
    }
  }, [viewport, floors, floorIndex])

  return {
    get activeFloorIndex() { return idToIndex(floors, viewport.activeFloorId) },
    selectFloor: (idx: number) => {
      const id = indexToId(floors, idx)
      if (id) viewport.setActiveFloor(id)
    },
  }
}
