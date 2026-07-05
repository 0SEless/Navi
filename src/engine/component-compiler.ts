import type {
  Component, ComponentType, NavNode, NavEdge, Building, LatLng,
} from '../types/nav-types'

export interface CompileResult {
  nodes: NavNode[]
  edges: NavEdge[]
  polygon?: LatLng[]
}

export interface CompileContext {
  buildings: Map<string, Building>
  existingNodes: NavNode[]
  existingEdges: NavEdge[]
  componentId: string
  campusId?: string
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
}

let _idCounter = 0
export function genId(prefix: string): string {
  _idCounter++
  return `${prefix}${String(_idCounter).padStart(4, '0')}`
}

function findNearestNode(
  position: LatLng,
  nodes: NavNode[],
  type?: string
): NavNode | null {
  let nearest: NavNode | null = null
  let minDist = Infinity
  for (const n of nodes) {
    if (type && n.type !== type) continue
    const d = haversine(position, n.position)
    if (d < minDist) {
      minDist = d
      nearest = n
    }
  }
  return nearest
}

function compileRoom(component: Component, context: CompileContext): CompileResult {
  const { existingNodes, existingEdges } = context
  const w = (component.dimensions?.width ?? 4) / 2
  const h = (component.dimensions?.height ?? 5) / 2
  const metersPerLat = 111320
  const metersPerLng = 111320 * Math.cos((component.position.lat * Math.PI) / 180)
  const dLat = h / metersPerLat
  const dLng = w / metersPerLng

  const roomLabel = component.name

  const polygon: LatLng[] = [
    { lat: component.position.lat - dLat, lng: component.position.lng - dLng }, // SW
    { lat: component.position.lat - dLat, lng: component.position.lng + dLng }, // SE
    { lat: component.position.lat + dLat, lng: component.position.lng + dLng }, // NE
    { lat: component.position.lat + dLat, lng: component.position.lng - dLng }, // NW
  ]

  // 4 corners (type: corner, non-navigable)
  const corners = [
    { pos: polygon[0], label: 'SW' },
    { pos: polygon[1], label: 'SE' },
    { pos: polygon[2], label: 'NE' },
    { pos: polygon[3], label: 'NW' },
  ]

  const cornerNodes: NavNode[] = corners.map((c) => ({
    id: genId('N'),
    label: `${roomLabel} ${c.label}`,
    name: `${roomLabel} ${c.label}`,
    type: 'corner' as const,
    buildingId: component.buildingId,
    campusId: context.campusId ?? '',
    floor: component.floor,
    position: c.pos,
  }))

  // 1 center node (POI, navigable)
  const centerNode: NavNode = {
    id: genId('N'),
    label: roomLabel,
    name: roomLabel,
    type: 'room',
    buildingId: component.buildingId,
    campusId: context.campusId ?? '',
    floor: component.floor,
    position: component.position,
  }

  // 4 wall edges (non-navigable)
  const wallEdges: NavEdge[] = [
    { id: genId('E'), from: cornerNodes[0].id, to: cornerNodes[1].id, type: 'wall', distance: w * 2, weight: w * 2, campusId: context.campusId ?? '' },
    { id: genId('E'), from: cornerNodes[1].id, to: cornerNodes[2].id, type: 'wall', distance: h * 2, weight: h * 2, campusId: context.campusId ?? '' },
    { id: genId('E'), from: cornerNodes[2].id, to: cornerNodes[3].id, type: 'wall', distance: w * 2, weight: w * 2, campusId: context.campusId ?? '' },
    { id: genId('E'), from: cornerNodes[3].id, to: cornerNodes[0].id, type: 'wall', distance: h * 2, weight: h * 2, campusId: context.campusId ?? '' },
  ]

  // Connect center to nearest corner
  const nearestCorner = findNearestNode(component.position, cornerNodes)
  const edges: NavEdge[] = [...wallEdges]
  if (nearestCorner) {
    edges.push({
      id: genId('E'),
      from: centerNode.id,
      to: nearestCorner.id,
      type: 'corridor',
      distance: haversine(component.position, nearestCorner.position),
      weight: haversine(component.position, nearestCorner.position),
      campusId: context.campusId ?? '',
    })
  }

  // Connect center to nearest hallway/intersection node
  const outdoorConnection = findNearestNode(
    component.position,
    [...existingNodes, ...cornerNodes, centerNode].filter((n: { type: string }) =>
      n.type === 'intersection' || n.type === 'building_entrance' || n.type === 'hallway'
    )
  )
  if (outdoorConnection && outdoorConnection.id !== centerNode.id) {
    const alreadyConnected = existingEdges.some(
      (e) =>
        (e.from === centerNode.id && e.to === outdoorConnection.id) ||
        (e.to === centerNode.id && e.from === outdoorConnection.id)
    )
    if (!alreadyConnected) {
      edges.push({
        id: genId('E'),
        from: centerNode.id,
        to: outdoorConnection.id,
        type: 'corridor',
        distance: haversine(component.position, outdoorConnection.position),
        weight: haversine(component.position, outdoorConnection.position),
        campusId: context.campusId ?? '',
      })
    }
  }

  return { nodes: [...cornerNodes, centerNode], edges, polygon }
}

function compileStair(component: Component, context: CompileContext): CompileResult {
  const range = component.range ?? { from: component.floor, to: component.floor + 1 }

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []

  for (let f = range.from; f <= range.to; f++) {
    const node: NavNode = {
      id: genId('N'),
      label: `${component.name} (F${f})`,
      name: `${component.name} (F${f})`,
      type: 'staircase',
      buildingId: component.buildingId,
      campusId: context.campusId ?? '',
      floor: f,
      position: component.position,
    }
    nodes.push(node)
    if (nodes.length > 1) {
      edges.push({
        id: genId('E'),
        from: nodes[nodes.length - 2].id,
        to: node.id,
        type: 'stairs',
        distance: 4,
        weight: 4,
        campusId: context.campusId ?? '',
      })
    }
  }

  return { nodes, edges }
}

function compileElevator(component: Component, context: CompileContext): CompileResult {
  const range = component.range ?? { from: 0, to: 2 }

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []

  for (let f = range.from; f <= range.to; f++) {
    const node: NavNode = {
      id: genId('N'),
      label: `${component.name} (F${f})`,
      name: `${component.name} (F${f})`,
      type: 'elevator',
      buildingId: component.buildingId,
      campusId: context.campusId ?? '',
      floor: f,
      position: component.position,
    }
    nodes.push(node)
    if (nodes.length > 1) {
      edges.push({
        id: genId('E'),
        from: nodes[nodes.length - 2].id,
        to: node.id,
        type: 'elevator',
        distance: 3,
        weight: 3,
        campusId: context.campusId ?? '',
      })
    }
  }

  return { nodes, edges }
}

function compileHallway(component: Component, context: CompileContext): CompileResult {
  // Use polygon points as drawn polyline when available
  if (component.polygon && component.polygon.length >= 2) {
    const nodes: NavNode[] = component.polygon.map((pos, i) => ({
      id: genId('N'),
      label: `${component.name} ${i === 0 ? 'Start' : i === component.polygon!.length - 1 ? 'End' : `Pt${i}`}`,
      name: `${component.name} ${i === 0 ? 'Start' : i === component.polygon!.length - 1 ? 'End' : `Pt${i}`}`,
      type: 'intersection',
      buildingId: component.buildingId,
      campusId: context.campusId ?? '',
      floor: component.floor,
      position: pos,
    }))
    const edges: NavEdge[] = nodes.slice(1).map((node, i) => ({
      id: genId('E'),
      from: nodes[i].id,
      to: node.id,
      type: 'corridor',
      distance: haversine(nodes[i].position, node.position),
      weight: haversine(nodes[i].position, node.position),
      campusId: context.campusId ?? '',
    }))
    return { nodes, edges }
  }

  // Fallback: legacy linear generation from position + width
  const length = component.dimensions?.width ?? 10
  const segmentCount = Math.max(2, Math.floor(length / 5))
  const dLngPerSegment = (length / segmentCount) / (111320 * Math.cos((component.position.lat * Math.PI) / 180))

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []

  for (let i = 0; i <= segmentCount; i++) {
    const pos: LatLng = {
      lat: component.position.lat,
      lng: component.position.lng + dLngPerSegment * i,
    }
    const node: NavNode = {
      id: genId('N'),
      label: `${component.name} ${i === 0 ? 'Start' : i === segmentCount ? 'End' : `Pt${i}`}`,
      name: `${component.name} ${i === 0 ? 'Start' : i === segmentCount ? 'End' : `Pt${i}`}`,
      type: 'intersection',
      buildingId: component.buildingId,
      campusId: context.campusId ?? '',
      floor: component.floor,
      position: pos,
    }
    nodes.push(node)
    if (i > 0) {
      edges.push({
        id: genId('E'),
        from: nodes[i - 1].id,
        to: node.id,
        type: 'corridor',
        distance: haversine(nodes[i - 1].position, pos),
        weight: haversine(nodes[i - 1].position, pos),
        campusId: context.campusId ?? '',
      })
    }
  }

  return { nodes, edges }
}

function compileEntrance(component: Component, context: CompileContext): CompileResult {
  const node: NavNode = {
    id: genId('N'),
    label: component.name,
    name: component.name,
    type: 'building_entrance',
    buildingId: component.buildingId,
    campusId: context.campusId ?? '',
    floor: component.floor,
    position: component.position,
    hasQr: (component.metadata as Record<string, boolean>)?.hasQr === true,
    hasPanorama: (component.metadata as Record<string, boolean>)?.hasPanorama === true,
  }

  const outdoorNodes = context.existingNodes.filter(
    (n) => n.type === 'outdoor' || n.type === 'intersection'
  )
  const nearestOutdoor = findNearestNode(component.position, outdoorNodes)

  const edges: NavEdge[] = []
  if (nearestOutdoor) {
    edges.push({
      id: genId('E'),
      from: node.id,
      to: nearestOutdoor.id,
      type: 'walkway',
      distance: haversine(component.position, nearestOutdoor.position),
      weight: haversine(component.position, nearestOutdoor.position),
      campusId: context.campusId ?? '',
    })
  }

  return { nodes: [node], edges }
}

const COMPILERS: Record<ComponentType, (c: Component, ctx: CompileContext) => CompileResult> = {
  room: compileRoom,
  stair: compileStair,
  elevator: compileElevator,
  hallway: compileHallway,
  entrance: compileEntrance,
  restroom: compileRoom, // restroom compiles same as room
}

export function compileComponent(
  component: Component,
  context: CompileContext
): CompileResult {
  const compiler = COMPILERS[component.type]
  if (!compiler) {
    return { nodes: [], edges: [] }
  }
  const result = compiler(component, context)
  return {
    nodes: result.nodes.map((n) => ({ ...n, componentId: context.componentId })),
    edges: result.edges,
    ...(result.polygon ? { polygon: result.polygon } : {}),
  }
}
