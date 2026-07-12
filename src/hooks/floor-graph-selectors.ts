'use client'

import { useMemo } from 'react'
import { useEditor, useDocumentSelector, useDocumentVersion, useBuilding, findBuilding } from '@navi/editor'
import type { CampusDocument, CoordinateTransformer, LocalCoord } from '@navi/core'
import { useGraphStore } from '@/store/graph-store'
import type { Component, LatLng, Building } from '@/types/nav-types'

// ── Coordinate helper ──

function localPointsToWorld(points: LocalCoord[], buildingId: string, transformer: CoordinateTransformer): LatLng[] {
  const out: LatLng[] = []
  for (const p of points) {
    const w = transformer.buildingLocalToWorld(p, buildingId)
    if (w) out.push(w)
  }
  return out
}

// ── Extract Component[] from a single floor ──

function extractFloorComponents(
  doc: CampusDocument,
  buildingId: string,
  floor: { level: number; rooms: any[]; hallways: any[]; staircases: any[]; elevators: any[]; entrances: any[] },
  transformer: CoordinateTransformer,
): Component[] {
  const result: Component[] = []

  for (const room of floor.rooms) {
    const worldPoints = localPointsToWorld(room.polygon.points, buildingId, transformer)
    if (worldPoints.length < 3) continue
    result.push({
      id: room.id, type: 'room', name: room.name || room.number,
      buildingId, campusId: '', floor: floor.level,
      position: worldPoints[0], polygon: worldPoints,
    })
  }

  for (const hw of floor.hallways) {
    const worldPoints = localPointsToWorld(hw.polyline.points, buildingId, transformer)
    if (worldPoints.length < 2) continue
    result.push({
      id: hw.id, type: 'hallway', name: hw.name,
      buildingId, campusId: '', floor: floor.level,
      position: worldPoints[0], polygon: worldPoints,
      dimensions: { width: hw.width },
    })
  }

  for (const stair of floor.staircases) {
    const wp = transformer.buildingLocalToWorld(stair.position, buildingId)
    if (!wp) continue
    result.push({
      id: stair.id, type: 'stair', name: stair.name,
      buildingId, campusId: '', floor: floor.level,
      position: wp, range: { from: stair.fromLevel, to: stair.toLevel },
    })
  }

  for (const elev of floor.elevators) {
    const wp = transformer.buildingLocalToWorld(elev.position, buildingId)
    if (!wp) continue
    result.push({
      id: elev.id, type: 'elevator', name: elev.name,
      buildingId, campusId: '', floor: floor.level,
      position: wp, range: { from: elev.fromLevel, to: elev.toLevel },
    })
  }

  for (const ent of floor.entrances) {
    result.push({
      id: ent.id, type: 'entrance', name: ent.label,
      buildingId, campusId: '', floor: ent.level,
      position: ent.position,
    })
  }

  return result
}

function findOneComponent(doc: CampusDocument, id: string, transformer: CoordinateTransformer): Component | null {
  if (!transformer) return null
  for (const building of doc.buildings) {
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        if (room.id !== id) continue
        const pts = localPointsToWorld(room.polygon.points, building.id, transformer)
        if (pts.length < 3) return null
        return { id: room.id, type: 'room', name: room.name || room.number, buildingId: building.id, campusId: '', floor: floor.level, position: pts[0], polygon: pts }
      }
      for (const hw of floor.hallways) {
        if (hw.id !== id) continue
        const pts = localPointsToWorld(hw.polyline.points, building.id, transformer)
        if (pts.length < 2) return null
        return { id: hw.id, type: 'hallway', name: hw.name, buildingId: building.id, campusId: '', floor: floor.level, position: pts[0], polygon: pts, dimensions: { width: hw.width } }
      }
      for (const stair of floor.staircases) {
        if (stair.id !== id) continue
        const wp = transformer.buildingLocalToWorld(stair.position, building.id)
        if (!wp) return null
        return { id: stair.id, type: 'stair', name: stair.name, buildingId: building.id, campusId: '', floor: floor.level, position: wp, range: { from: stair.fromLevel, to: stair.toLevel } }
      }
      for (const elev of floor.elevators) {
        if (elev.id !== id) continue
        const wp = transformer.buildingLocalToWorld(elev.position, building.id)
        if (!wp) return null
        return { id: elev.id, type: 'elevator', name: elev.name, buildingId: building.id, campusId: '', floor: floor.level, position: wp, range: { from: elev.fromLevel, to: elev.toLevel } }
      }
      for (const ent of floor.entrances) {
        if (ent.id !== id) continue
        return { id: ent.id, type: 'entrance', name: ent.label, buildingId: building.id, campusId: '', floor: ent.level, position: ent.position }
      }
    }
  }
  return null
}

// ── Floor geometry hooks ──

export function useFloorComponents(buildingId: string, floor: number): Component[] {
  const { transformer } = useEditor()
  return useDocumentSelector((doc) => {
    if (!transformer) return []
    const building = findBuilding(doc, buildingId)
    if (!building) return []
    const f = building.floors.find((fl) => fl.level === floor)
    if (!f) return []
    return extractFloorComponents(doc, buildingId, f, transformer)
  })
}

export function useFloorComponent(id: string | null | undefined): Component | null {
  const { transformer } = useEditor()
  return useDocumentSelector((doc) => {
    if (!id || !transformer) return null
    return findOneComponent(doc, id, transformer)
  })
}

export function useFloorComponentsAll(buildingId: string): Component[] {
  const { transformer } = useEditor()
  return useDocumentSelector((doc) => {
    if (!transformer) return []
    const building = findBuilding(doc, buildingId)
    if (!building) return []
    const all: Component[] = []
    for (const floor of building.floors) {
      all.push(...extractFloorComponents(doc, buildingId, floor, transformer))
    }
    return all
  })
}

// ── Render version ──

export function useFloorRenderVersion(): number {
  return useDocumentVersion()
}

// ── Campus ID (legacy — document no longer stores campusId) ──

export function useFloorCampusId(): string {
  const { document } = useEditor()
  useDocumentVersion()
  return useMemo(() => document.buildings[0]?.id ?? '', [document])
}

// ── Sync status (graph-store bridge — kept for toolbar indicators) ──

export function useFloorSyncStatus(): string {
  return useGraphStore((s) => s.syncStatus)
}

export function useFloorSyncError(): string | null {
  return useGraphStore((s) => s.syncError ?? null)
}

// ── Legacy Building bridge (nav-types Building) ──

function toLegacyBuilding(b: import('@navi/core').Building): Building {
  const entrances: Building['entrances'] = []
  for (const f of b.floors) {
    for (const e of f.entrances) {
      entrances.push({ id: e.id, position: e.position, floor: e.level, label: e.label })
    }
  }
  const floorPlanUrls: Record<number, string> = {}
  for (const f of b.floors) {
    if (f.planImageId) floorPlanUrls[f.level] = f.planImageId
  }
  return {
    id: b.id,
    name: b.name,
    campusId: '',
    floors: b.floors.map((f) => f.level),
    footprint: b.footprint.points,
    baseElevation: b.baseElevation,
    height: b.height,
    color: b.color,
    code: b.code,
    description: b.description,
    center: b.footprint.points[0],
    department: b.department,
    category: b.category,
    entrances,
    floorPlanUrls: Object.keys(floorPlanUrls).length > 0 ? floorPlanUrls : undefined,
  }
}

export function useLegacyBuilding(buildingId: string): Building | undefined {
  const building = useBuilding(buildingId)
  return useMemo(() => (building ? toLegacyBuilding(building) : undefined), [building])
}

export function useGraphBuilding(buildingId: string): Building | undefined {
  return useLegacyBuilding(buildingId)
}

// ── Floor plan URLs bridge ──

export function useFloorPlanUrls(): Record<number, string> | undefined {
  const { document } = useEditor()
  useDocumentVersion()
  return useMemo(() => {
    const b = document.buildings[0]
    if (!b) return undefined
    const urls: Record<number, string> = {}
    for (const f of b.floors) {
      if (f.planImageId) urls[f.level] = f.planImageId
    }
    return Object.keys(urls).length > 0 ? urls : undefined
  }, [document])
}

// ── One-shot reads (graph-store bridge for callbacks; migrated in T3–T6) ──

export function countFloorComponents(buildingId: string, floor: number, type: string): number {
  const graph = useGraphStore.getState().graph
  return graph.components.filter((c) => c.type === type && c.buildingId === buildingId && c.floor === floor).length
}

export function findGraphBuilding(buildingId: string): Building | undefined {
  const graph = useGraphStore.getState().graph
  return graph.buildings.find((b) => b.id === buildingId)
}
