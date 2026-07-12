import { useMemo } from 'react'
import { useEditor, useDocumentVersion } from '.'
import { useWorkspace } from './workspace-context'
import { findBuilding, findFloorByLevel, getBuildingFloorCount, getBuildingFloors } from './selectors'
import type { CampusDocument, Building, Floor } from '@navi/core'

export function useDocumentSelector<T>(selector: (doc: CampusDocument) => T): T {
  const { document } = useEditor()
  useDocumentVersion()
  return useMemo(() => selector(document), [document, selector])
}

function getActiveBuildingId(): string | null {
  const { services } = useEditor()
  const ws = useWorkspace()
  return ws.activeBuildingId ?? services.get('viewport')?.activeBuildingId ?? null
}

export function useActiveBuilding(): Building | undefined {
  const { document } = useEditor()
  useDocumentVersion()
  const buildingId = getActiveBuildingId()
  return useMemo(() => {
    if (!buildingId) return undefined
    return findBuilding(document, buildingId)
  }, [document, buildingId])
}

export function useBuilding(id: string | undefined): Building | undefined {
  const { document } = useEditor()
  useDocumentVersion()
  return useMemo(() => {
    if (!id) return undefined
    return findBuilding(document, id)
  }, [document, id])
}

export function useFloorCount(): number {
  const { document } = useEditor()
  useDocumentVersion()
  const buildingId = getActiveBuildingId()
  return useMemo(() => {
    if (!buildingId) return 0
    return getBuildingFloorCount(document, buildingId)
  }, [document, buildingId])
}

export function useFloor(level: number): Floor | undefined {
  const { document } = useEditor()
  useDocumentVersion()
  const buildingId = getActiveBuildingId()
  return useMemo(() => {
    if (!buildingId) return undefined
    return findFloorByLevel(document, buildingId, level)
  }, [document, buildingId, level])
}

export function useBuildingFloors(buildingId: string | undefined): Floor[] {
  const { document } = useEditor()
  useDocumentVersion()
  return useMemo(() => {
    if (!buildingId) return []
    return getBuildingFloors(document, buildingId)
  }, [document, buildingId])
}
