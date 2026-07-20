import type {
  NavigationGraphFile,
  NavNodeFile,
  NavEdgeFile,
  SearchIndexFile,
  SearchEntryFile,
  BuildingIndexFile,
  BuildingEntryFile,
  EntranceEntryFile,
  FloorEntryFile,
  POIIndexFile,
  POIEntryFile,
  PanoramaIndexFile,
  PanoramaEntryFile,
  HotspotFile,
} from '@navi/core'
import type {
  NavigationGraph,
  NavNode,
  NavEdge,
  SearchIndex,
  SearchEntry,
  BuildingIndex,
  BuildingEntry,
  FloorEntry,
  POIIndex,
  POI,
  PanoramaIndex,
  PanoramaEntry,
  HotspotEntry,
  BoundingBox,
} from '@navi/core'

function computeBoundingBox(nodes: NavNodeFile[]): BoundingBox {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  for (const n of nodes) {
    if (n.lat < minLat) minLat = n.lat
    if (n.lat > maxLat) maxLat = n.lat
    if (n.lng < minLng) minLng = n.lng
    if (n.lng > maxLng) maxLng = n.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

function toNavNode(n: NavNodeFile): NavNode {
  return {
    id: n.id,
    label: '',
    type: n.type as NavNode['type'],
    position: { lat: n.lat, lng: n.lng },
    floor: n.floor,
    buildingId: n.buildingId,
    properties: {},
  }
}

function toNavEdge(e: NavEdgeFile): NavEdge {
  const type = e.type === 'escalator' || e.type === 'ramp' ? 'walk' as const : e.type as NavEdge['type']
  return { id: e.id, from: e.from, to: e.to, type, distance: e.distance, weight: e.weight }
}

function toSearchEntry(e: SearchEntryFile): SearchEntry {
  return {
    id: e.id,
    label: e.label,
    type: e.type,
    nodeId: e.nodeId,
    position: { lat: e.lat, lng: e.lng },
    tags: e.tags,
    buildingId: e.buildingId,
    floor: e.floor,
  }
}

function toFloorEntry(f: FloorEntryFile): FloorEntry {
  return {
    level: f.level,
    label: f.label,
    elevation: 0,
    rooms: f.nodeIds.map(id => ({ id, name: '', number: '', nodeId: id })),
  }
}

function toBuildingEntry(b: BuildingEntryFile): BuildingEntry {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    category: '',
    position: b.position,
    floors: b.floors.map(toFloorEntry),
    entrances: b.entrances.map((e: EntranceEntryFile) => ({
      id: e.id,
      label: e.label,
      position: { lat: 0, lng: 0 },
    })),
    nodeId: '',
  }
}

function toPOI(p: POIEntryFile): POI {
  return {
    id: p.id,
    label: p.label,
    category: p.category,
    position: { lat: p.lat, lng: p.lng },
    buildingId: p.buildingId,
    floor: p.floor,
    nodeId: p.nodeId,
    properties: p.properties,
  }
}

export function toRuntimeGraph(file: NavigationGraphFile): NavigationGraph {
  const nodes = file.nodes.map(toNavNode)
  return {
    version: file.schemaVersion,
    campusId: file.campusId,
    createdAt: '',
    checksum: file.checksum,
    nodes,
    edges: file.edges.map(toNavEdge),
    metadata: {
      nodeCount: nodes.length,
      edgeCount: file.edges.length,
      buildings: 0,
      floors: 0,
      boundingBox: computeBoundingBox(file.nodes),
    },
  }
}

export function toRuntimeSearch(file: SearchIndexFile): SearchIndex {
  return { version: file.schemaVersion, entries: file.entries.map(toSearchEntry) }
}

export function toRuntimeBuildings(file: BuildingIndexFile): BuildingIndex {
  return { version: file.schemaVersion, buildings: file.buildings.map(toBuildingEntry) }
}

export function toRuntimePOI(file: POIIndexFile): POIIndex {
  return { version: file.schemaVersion, points: file.points.map(toPOI) }
}

function toHotspot(h: HotspotFile): HotspotEntry {
  return {
    id: h.id,
    type: h.type,
    target: h.target,
    yaw: h.yaw,
    pitch: h.pitch,
    label: h.label,
  }
}

function toPanoramaEntry(p: PanoramaEntryFile): PanoramaEntry {
  return {
    id: p.id,
    title: p.title,
    imageAssetId: p.imageAssetId,
    buildingId: p.buildingId,
    floor: p.floor,
    position: { lat: p.lat, lng: p.lng },
    heading: p.heading,
    hotspots: p.hotspots.map(toHotspot),
  }
}

export function toRuntimePanorama(file: PanoramaIndexFile): PanoramaIndex {
  return { version: file.schemaVersion, panoramas: file.panoramas.map(toPanoramaEntry) }
}
