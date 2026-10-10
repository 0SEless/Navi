/**
 * Pure derivations for the Dataset Explorer and content views.
 *
 * All functions are read-only projections over CampusDocument/CampusMap — no
 * mutation, no invented data. Anything not present in the authored document
 * surfaces as `undefined` / `[]` / `missing: true` so views can render an
 * honest empty state instead of fabricated content.
 */

import type {
  Area,
  Building,
  CampusDocument,
  Floor,
  OutdoorPointOfInterest,
  Panorama,
} from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import type { DatasetSelection } from './types'

/** A selectable outdoor entry with its composite ref. */
export interface OutdoorItem {
  ref: string // 'poi:{id}' | 'area:{id}'
  kind: 'poi' | 'area'
  name: string
}

/** All outdoor items (campus POIs + areas) in document order. */
export function getOutdoorItems(document: CampusDocument | null): OutdoorItem[] {
  if (!document) return []
  const items: OutdoorItem[] = []
  for (const poi of document.pois ?? []) {
    items.push({ ref: `poi:${poi.id}`, kind: 'poi', name: poi.name })
  }
  for (const area of document.areas ?? []) {
    items.push({ ref: `area:${area.id}`, kind: 'area', name: area.name })
  }
  return items
}

export function findBuilding(
  document: CampusDocument | null,
  buildingId: string,
): Building | undefined {
  return document?.buildings.find((b) => b.id === buildingId)
}

export function findFloor(building: Building | undefined, floorId: string): Floor | undefined {
  return building?.floors.find((f) => f.id === floorId)
}

export function findOutdoorPoi(
  document: CampusDocument | null,
  ref: string,
): OutdoorPointOfInterest | undefined {
  if (!ref.startsWith('poi:')) return undefined
  const id = ref.slice('poi:'.length)
  return document?.pois?.find((p) => p.id === id)
}

export function findOutdoorArea(
  document: CampusDocument | null,
  ref: string,
): Area | undefined {
  if (!ref.startsWith('area:')) return undefined
  const id = ref.slice('area:'.length)
  return document?.areas?.find((a) => a.id === id)
}

/** Result of resolving a selection against the authored document. */
export interface ResolvedSelection {
  /** Display breadcrumb from campus root to the selection. */
  path: string[]
  /** True when the selection points at an entity that no longer exists. */
  missing: boolean
  building?: Building
  floor?: Floor
  outdoor?: OutdoorItem
  poi?: OutdoorPointOfInterest
  area?: Area
}

/**
 * Resolve the current selection to concrete entities.
 *
 * When the document is absent or the entity was removed, `missing` is true and
 * only the campus breadcrumb is returned — views must render a "no longer
 * exists" state instead of guessing.
 */
export function resolveSelection(
  campus: CampusMap,
  document: CampusDocument | null,
  selection: DatasetSelection,
): ResolvedSelection {
  switch (selection.kind) {
    case 'campus':
      return { path: [campus.name], missing: false }

    case 'building': {
      const building = findBuilding(document, selection.buildingId)
      if (!building) return { path: [campus.name], missing: true }
      return { path: [campus.name, building.name], missing: false, building }
    }

    case 'floor': {
      const building = findBuilding(document, selection.buildingId)
      const floor = findFloor(building, selection.floorId)
      if (!building || !floor) return { path: [campus.name], missing: true }
      return {
        path: [campus.name, building.name, floor.label],
        missing: false,
        building,
        floor,
      }
    }

    case 'outdoor': {
      const item = getOutdoorItems(document).find((i) => i.ref === selection.ref)
      if (!item) return { path: [campus.name], missing: true }
      const poi = item.kind === 'poi' ? findOutdoorPoi(document, selection.ref) : undefined
      const area = item.kind === 'area' ? findOutdoorArea(document, selection.ref) : undefined
      return { path: [campus.name, item.name], missing: false, outdoor: item, poi, area }
    }
  }
}

/**
 * Panoramas associated with the selected scope (read-only 360 view):
 * - campus: all authored campus scenes
 * - building: panoramas authored inside that building
 * - floor: building panoramas whose `floor` matches the floor level
 * - outdoor: no per-item association exists in the document → []
 */
export function getPanoramasForScope(
  document: CampusDocument | null,
  selection: DatasetSelection,
  resolved: ResolvedSelection,
): Panorama[] {
  if (!document) return []
  const all = document.panoramas ?? []
  switch (selection.kind) {
    case 'campus':
      return all
    case 'building':
      return all.filter((p) => p.buildingId === selection.buildingId)
    case 'floor': {
      if (!resolved.floor) return []
      const level = resolved.floor.level
      return all.filter((p) => p.buildingId === selection.buildingId && p.floor === level)
    }
    case 'outdoor':
      return []
  }
}

/** Aggregate counts for campus-level read-only summaries. */
export interface CampusDatasetCounts {
  buildings: number
  roads: number
  pois: number
  areas: number
  panoramas: number
  qrCheckpoints: number
}

export function getCampusCounts(document: CampusDocument | null): CampusDatasetCounts {
  if (!document) {
    return { buildings: 0, roads: 0, pois: 0, areas: 0, panoramas: 0, qrCheckpoints: 0 }
  }
  return {
    buildings: document.buildings.length,
    roads: document.roads.length,
    pois: document.pois?.length ?? 0,
    areas: document.areas?.length ?? 0,
    panoramas: document.panoramas.length,
    qrCheckpoints: document.qrCheckpoints.length,
  }
}
