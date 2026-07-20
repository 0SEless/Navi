import type { ConnectivityGraph, NavigationGraph, NavigationArtifacts, SearchEntry, POI, BuildingEntry, FloorEntry } from '../types'
import type { CampusDocument, PanoramaIndex, PanoramaEntry, HotspotEntry } from '@navi/core'

/**
 * Phase 4: Build Navigation Artifacts.
 *
 * Transforms the emited NavigationGraph + original ConnectivityGraph metadata
 * into search, spatial, building, POI, and (optionally) panorama indexes.
 *
 * Zero spatial search. Zero validation. Pure mechanical transform.
 */
export function buildArtifacts(graph: ConnectivityGraph, navGraph: NavigationGraph, document: CampusDocument): NavigationArtifacts {
  const panoramaIndex = buildPanoramaIndex(document)
  return {
    graph: navGraph,
    searchIndex: buildSearchIndex(navGraph),
    spatialIndex: buildSpatialIndex(navGraph),
    buildingIndex: buildBuildingIndex(graph, navGraph),
    poiIndex: buildPOIIndex(navGraph),
    panoramaIndex,
    extensions: {},
  }
}

function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().split(/[\s_\-:;,.!?]+/).filter(Boolean)
  return [...new Set(tokens)]
}

function buildSearchIndex(navGraph: NavigationGraph): NavigationArtifacts['searchIndex'] {
  const entries: SearchEntry[] = []

  for (const node of navGraph.nodes) {
    let type: SearchEntry['type']
    switch (node.type) {
      case 'outdoor':
      case 'entrance':
        type = 'entrance'
        break
      case 'poi':
        type = 'poi'
        break
      case 'waypoint':
      case 'transition':
        continue
      default:
        continue
    }

    const tags = node.label ? tokenize(node.label) : []

    entries.push({
      id: `${node.id}_search`,
      label: node.label || '',
      type,
      nodeId: node.id,
      position: node.position,
      tags,
      buildingId: node.buildingId,
      floor: node.floor,
    })
  }

  return { version: '1.0.0', entries }
}

function buildSpatialIndex(navGraph: NavigationGraph): NavigationArtifacts['spatialIndex'] {
  const cellSize = 0.001 // ~111m at equator
  const cells: Record<string, string[]> = {}

  for (const node of navGraph.nodes) {
    const cellKey = `${Math.floor(node.position.lat / cellSize)},${Math.floor(node.position.lng / cellSize)}`
    if (!cells[cellKey]) cells[cellKey] = []
    cells[cellKey].push(node.id)
  }

  return { version: '1.0.0', cells, cellSize }
}

function buildBuildingIndex(
  graph: ConnectivityGraph,
  navGraph: NavigationGraph,
): NavigationArtifacts['buildingIndex'] {
  const buildingMap = new Map<string, { name: string; entrances: { id: string; label: string; position: { lat: number; lng: number } }[]; floors: Set<number>; nodeIds: Set<string> }>()

  // Collect building info from connectivity graph nodes
  for (const node of graph.nodes) {
    if (!buildingMap.has(node.buildingId)) {
      buildingMap.set(node.buildingId, {
        name: '',
        entrances: [],
        floors: new Set(),
        nodeIds: new Set(),
      })
    }
    const entry = buildingMap.get(node.buildingId)!
    entry.floors.add(node.floor)
  }

  // Map nav node IDs to buildings
  const nodeBuildingMap = new Map<string, string>()
  for (const node of graph.nodes) {
    const navIds = navGraph.nodes.filter(n => {
      // Rough heuristic: same building + same floor + close position
      return n.buildingId === node.buildingId && n.floor === node.floor
    })
    for (const n of navIds) {
      nodeBuildingMap.set(n.id, node.buildingId)
    }
  }

  // Collect entrance nodes
  for (const node of navGraph.nodes) {
    if (node.type === 'entrance' || node.type === 'outdoor') {
      const buildingId = nodeBuildingMap.get(node.id) || node.buildingId
      if (!buildingMap.has(buildingId)) {
        buildingMap.set(buildingId, {
          name: '',
          entrances: [],
          floors: new Set(),
          nodeIds: new Set(),
        })
      }
      const entry = buildingMap.get(buildingId)!
      entry.entrances.push({
        id: node.id,
        label: node.label || '',
        position: node.position,
      })
    }
  }

  const buildings: BuildingEntry[] = []
  for (const [id, data] of buildingMap) {
    const sortedFloors = [...data.floors].sort((a, b) => a - b)
    const floorEntries: FloorEntry[] = sortedFloors.map(level => ({
      level,
      label: `Floor ${level}`,
      elevation: level * 3,
      rooms: [],
    }))

    const navNode = navGraph.nodes.find(n => n.buildingId === id)
    buildings.push({
      id,
      name: data.name || id,
      code: id.toLowerCase().replace(/\s+/g, '-'),
      category: 'building',
      position: navNode?.position || { lat: 0, lng: 0 },
      floors: floorEntries,
      entrances: data.entrances,
      nodeId: navNode?.id || '',
    })
  }

  return { version: '1.0.0', buildings }
}

function buildPOIIndex(navGraph: NavigationGraph): NavigationArtifacts['poiIndex'] {
  const points: POI[] = []

  for (const node of navGraph.nodes.filter(n => n.type === 'poi')) {
    points.push({
      id: `${node.id}_poi`,
      label: node.label || '',
      category: node.label || 'poi',
      position: node.position,
      buildingId: node.buildingId,
      floor: node.floor,
      nodeId: node.id,
      properties: {},
    })
  }

  return { version: '1.0.0', points }
}

function normalizeHotspotType(targetType: string): 'navigation' | 'information' | 'link' {
  if (targetType === 'url') return 'link'
  if (targetType === 'panorama' || targetType === 'room' || targetType === 'entrance' || targetType === 'qr') return 'navigation'
  return 'information'
}

function buildPanoramaIndex(document: CampusDocument): PanoramaIndex {
  const panoramas: PanoramaEntry[] = document.panoramas
    .map(p => ({
      id: p.id,
      title: p.label,
      imageAssetId: p.imageAssetId,
      buildingId: p.buildingId,
      floor: p.floor,
      position: { lat: p.position.lat, lng: p.position.lng },
      heading: p.heading,
      hotspots: p.hotspots.map(h => ({
        id: `${p.id}_hotspot_${h.position.yaw}_${h.position.pitch}`,
        type: normalizeHotspotType(h.target.type),
        target: h.target.targetId,
        yaw: h.position.yaw,
        pitch: h.position.pitch,
        label: h.label,
      })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return { version: '1.0.0', panoramas }
}
