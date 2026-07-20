import type {
  NavigationArtifacts,
  BuildingEntry as CoreBuildingEntry,
  FloorEntry as CoreFloorEntry,
} from '@navi/core'
import type {
  BuiltPackage,
  NavNodeFile,
  NavEdgeFile,
  NavigationGraphFile,
  SearchEntryFile,
  SearchIndexFile,
  SpatialIndexFile,
  BuildingEntryFile,
  FloorEntryFile,
  EntranceEntryFile,
  BuildingIndexFile,
  POIEntryFile,
  POIIndexFile,
  PanoramaIndexFile,
  PanoramaEntryFile,
  HotspotFile,
  PackageMetadata,
} from './types'
import type { PublishOptions } from './types'

function mapNodeType(type: string): NavNodeFile['type'] {
  switch (type) {
    case 'poi': return 'poi'
    case 'transition': return 'transition'
    case 'outdoor': return 'outdoor'
    case 'entrance': return 'entrance'
    default: return 'waypoint'
  }
}

function mapEdgeType(type: string): NavEdgeFile['type'] {
  switch (type) {
    case 'stairs': return 'stairs'
    case 'elevator': return 'elevator'
    case 'transition': return 'transition'
    default: return 'walk'
  }
}

function buildGraphFile(artifacts: NavigationArtifacts, campusId: string, schemaVersion: string): NavigationGraphFile {
  const nodes: NavNodeFile[] = artifacts.graph.nodes.map(n => ({
    id: n.id,
    type: mapNodeType(n.type),
    lat: n.position.lat,
    lng: n.position.lng,
    floor: n.floor,
    buildingId: n.buildingId,
  }))

  const edges: NavEdgeFile[] = artifacts.graph.edges.map(e => ({
    id: e.id,
    from: e.from,
    to: e.to,
    type: mapEdgeType(e.type),
    distance: e.distance,
    weight: e.weight,
  }))

  return {
    schemaVersion,
    campusId,
    checksum: artifacts.graph.checksum,
    nodes,
    edges,
  }
}

function buildSearchFile(artifacts: NavigationArtifacts, schemaVersion: string): SearchIndexFile | undefined {
  if (!artifacts.searchIndex) return undefined

  const entries: SearchEntryFile[] = artifacts.searchIndex.entries.map(e => ({
    id: e.id,
    label: e.label,
    type: e.type,
    nodeId: e.nodeId,
    lat: e.position.lat,
    lng: e.position.lng,
    tags: e.tags,
    buildingId: e.buildingId,
    floor: e.floor,
  }))

  return { schemaVersion, entries }
}

function buildSpatialFile(artifacts: NavigationArtifacts, schemaVersion: string): SpatialIndexFile | undefined {
  if (!artifacts.spatialIndex) return undefined

  return {
    schemaVersion,
    cellSize: artifacts.spatialIndex.cellSize,
    cells: { ...artifacts.spatialIndex.cells },
  }
}

function findEntranceNodeId(
  entranceId: string,
  entrancePosition: { lat: number; lng: number },
  buildingId: string,
  graphNodes: NavNodeFile[],
): string {
  const candidates = graphNodes.filter(
    n => n.buildingId === buildingId && (n.type === 'entrance' || n.type === 'outdoor'),
  )
  if (candidates.length === 1) return candidates[0].id

  const closest = candidates.reduce((best, n) => {
    const dist = Math.hypot(n.lat - entrancePosition.lat, n.lng - entrancePosition.lng)
    return dist < best.dist ? { node: n, dist } : best
  }, { node: candidates[0], dist: Infinity })
  return closest.node?.id ?? entranceId
}

function buildBuildingFile(
  artifacts: NavigationArtifacts,
  schemaVersion: string,
  graphNodes: NavNodeFile[],
): BuildingIndexFile | undefined {
  if (!artifacts.buildingIndex) return undefined

  const buildings: BuildingEntryFile[] = artifacts.buildingIndex.buildings.map(b => {
    const floorMap = new Map<number, string[]>()

    for (const node of graphNodes) {
      if (node.buildingId === b.id) {
        const ids = floorMap.get(node.floor) ?? []
        ids.push(node.id)
        floorMap.set(node.floor, ids)
      }
    }

    const floors: FloorEntryFile[] = b.floors.map((f: CoreFloorEntry) => ({
      level: f.level,
      label: f.label,
      nodeIds: floorMap.get(f.level) ?? [],
    }))

    const entrances: EntranceEntryFile[] = b.entrances.map(e => ({
      id: e.id,
      label: e.label,
      nodeId: findEntranceNodeId(e.id, e.position, b.id, graphNodes),
    }))

    return {
      id: b.id,
      name: b.name,
      code: b.code,
      position: { lat: b.position.lat, lng: b.position.lng },
      floors,
      entrances,
    }
  })

  return { schemaVersion, buildings }
}

function buildPOIFile(artifacts: NavigationArtifacts, schemaVersion: string): POIIndexFile | undefined {
  if (!artifacts.poiIndex) return undefined

  const points: POIEntryFile[] = artifacts.poiIndex.points.map(p => ({
    id: p.id,
    label: p.label,
    category: p.category,
    lat: p.position.lat,
    lng: p.position.lng,
    nodeId: p.nodeId,
    buildingId: p.buildingId,
    floor: p.floor,
    properties: { ...p.properties },
  }))

  return { schemaVersion, points }
}

function buildPanoramaFile(artifacts: NavigationArtifacts, schemaVersion: string): PanoramaIndexFile | undefined {
  if (!artifacts.panoramaIndex) return undefined

  const panoramas: PanoramaEntryFile[] = artifacts.panoramaIndex.panoramas.map(p => ({
    id: p.id,
    title: p.title,
    imageAssetId: p.imageAssetId,
    buildingId: p.buildingId,
    floor: p.floor,
    lat: p.position.lat,
    lng: p.position.lng,
    heading: p.heading,
    hotspots: p.hotspots.map(h => ({
      id: h.id,
      type: h.type,
      target: h.target,
      yaw: h.yaw,
      pitch: h.pitch,
      label: h.label,
    })) as HotspotFile[],
  }))

  return { schemaVersion, panoramas }
}

function buildMetadata(artifacts: NavigationArtifacts, graphNodes: NavNodeFile[]): PackageMetadata {
  const buildings = new Set<string>()
  const floors = new Set<string>()

  for (const node of graphNodes) {
    buildings.add(node.buildingId)
    floors.add(`${node.buildingId}:${node.floor}`)
  }

  const boundingBox = artifacts.graph.metadata.boundingBox
  const routeable = artifacts.graph.nodes.length >= 2 && graphNodes.length >= 2

  return {
    nodeCount: graphNodes.length,
    edgeCount: artifacts.graph.edges.length,
    buildingCount: buildings.size,
    floorCount: floors.size,
    boundingBox: { ...boundingBox },
    routeable,
  }
}

export function build(
  artifacts: NavigationArtifacts,
  options: PublishOptions,
): BuiltPackage {
  const graphSchema = options.schemaVersions?.graph ?? '1.0.0'
  const searchSchema = options.schemaVersions?.search ?? '1.0.0'
  const spatialSchema = options.schemaVersions?.spatial ?? '1.0.0'
  const buildingSchema = options.schemaVersions?.building ?? '1.0.0'
  const poiSchema = options.schemaVersions?.poi ?? '1.0.0'
  const panoramaSchema = options.schemaVersions?.panorama ?? '1.0.0'

  const graphFile = buildGraphFile(artifacts, options.campusId, graphSchema)
  const metadata = buildMetadata(artifacts, graphFile.nodes)

  return {
    campusId: options.campusId,
    campusName: options.campusName,
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    compilerVersion: artifacts.metadata?.compilerVersion ?? '',
    revision: artifacts.metadata?.revision ?? '',
    metadata,
    graph: graphFile,
    search: buildSearchFile(artifacts, searchSchema),
    spatial: buildSpatialFile(artifacts, spatialSchema),
    building: buildBuildingFile(artifacts, buildingSchema, graphFile.nodes),
    poi: buildPOIFile(artifacts, poiSchema),
    panorama: buildPanoramaFile(artifacts, panoramaSchema),
    schemaVersions: {
      graph: graphSchema,
      search: searchSchema,
      spatial: spatialSchema,
      building: buildingSchema,
      poi: poiSchema,
      panorama: panoramaSchema,
    },
  }
}
