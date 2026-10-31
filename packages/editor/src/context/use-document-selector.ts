import { useMemo } from 'react'
import { useEditor, useDocumentVersion } from '.'
import { useWorkspace } from './workspace-context'
import { useSelection } from './selection-store'
import { findBuilding, findFloorById, getBuildingFloorCount, getBuildingFloors } from './selectors'
import type { CampusDocument, Building, Floor } from '@navi/core'

export function useDocumentSelector<T>(selector: (doc: CampusDocument) => T): T {
  const { document } = useEditor()
  const documentVersion = useDocumentVersion()
  // Commands mutate the editor-owned document in place and publish the
  // mutation through DocumentStore.version. Include that version in the
  // memo key so projections recompute after Save/undo/redo.
  return useMemo(() => selector(document), [document, selector, documentVersion])
}

function useActiveBuildingId(): string | null {
  const { services } = useEditor()
  const ws = useWorkspace()
  return ws.activeBuildingId ?? services.get('viewport')?.activeBuildingId ?? null
}

export function useActiveBuilding(): Building | undefined {
  const { document } = useEditor()
  useDocumentVersion()
  const buildingId = useActiveBuildingId()
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
  const buildingId = useActiveBuildingId()
  return useMemo(() => {
    if (!buildingId) return 0
    return getBuildingFloorCount(document, buildingId)
  }, [document, buildingId])
}

/** Return the floors for the active building in the current workspace. */
export function useBuildingFloors(): Floor[] {
  const { document } = useEditor()
  const documentVersion = useDocumentVersion()
  const buildingId = useActiveBuildingId()
  return useMemo(() => {
    if (!buildingId) return []
    return getBuildingFloors(document, buildingId)
  }, [document, documentVersion, buildingId])
}

/** Return the active floor, constrained to its owning building. */
export function useFloor(): Floor | undefined {
  const { document, services } = useEditor()
  const documentVersion = useDocumentVersion()
  const workspace = useWorkspace()
  const selected = useSelection()
  const buildingId = workspace.activeBuildingId ?? services.get('viewport')?.activeBuildingId ?? null
  const selectedEntityFloorId = selected.lastSelected && 'floorId' in selected.lastSelected
    ? selected.lastSelected.floorId
    : null
  const floorId = workspace.activeFloorId ?? selectedEntityFloorId ?? services.get('viewport')?.activeFloorId ?? null

  return useMemo(() => {
    if (!buildingId || !floorId) return undefined
    return findFloorById(document, buildingId, floorId)
  }, [document, documentVersion, buildingId, floorId])
}


