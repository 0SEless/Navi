import type {
  Component, ComponentType, NavNode, NavEdge, Building, LatLng,
} from '../types/nav-types'

export interface CompileResult {
  nodes: NavNode[]
  edges: NavEdge[]
}

export interface CompileContext {
  buildings: Map<string, Building>
  existingNodes: NavNode[]
  existingEdges: NavEdge[]
  componentId: string
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
function genId(prefix: string): string {
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
  const { buildings, existingNodes, existingEdges } = context
  const w = (component.dimensions?.width ?? 4) / 2
  const h = (component.dimensions?.height ?? 5) / 2
  const metersPerLat = 111320
  const metersPerLng = 111320 * Math.cos((component.position.lat * Math.PI) / 180)
  const dLat = h / metersPerLat
  const dLng = w / metersPerLng

  const building = buildings.get(component.buildingId)
  const roomLabel = component.name

  // 4 corners (type: corner, non-navigable)
  const corners = [
    { pos: { lat: component.position.lat - dLat, lng: component.position.lng - dLng }, label: 'SW' },
    { pos: { lat: component.position.lat - dLat, lng: component.position.lng + dLng }, label: 'SE' },
    { pos: { lat: component.position.lat + dLat, lng: component.position.lng + dLng }, label: 'NE' },
    { pos: { lat: component.position.lat + dLat, lng: component.position.lng - dLng }, label: 'NW' },
  ]

  const cornerNodes: NavNode[] = corners.map((c) => ({
    id: genId('N'),
    name: `${roomLabel} ${c.label}`,
    type: 'corner' as const,
    buildingId: component.buildingId,
    floor: component.floor,
    position: c.pos,
  }))

  // 1 center node (POI, navigable)
  const centerNode: NavNode = {
    id: genId('N'),
    name: roomLabel,
    type: 'room',
    buildingId: component.buildingId,
    floor: component.floor,
    position: component.position,
  }

  // 4 wall edges (non-navigable)
  const wallEdges: NavEdge[] = [
    { id: genId('E'), from: cornerNodes[0].id, to: cornerNodes[1].id, type: 'wall', distance: w * 2 },
    { id: genId('E'), from: cornerNodes[1].id, to: cornerNodes[2].id, type: 'wall', distance: h * 2 },
    { id: genId('E'), from: cornerNodes[2].id, to: cornerNodes[3].id, type: 'wall', distance: w * 2 },
    { id: genId('E'), from: cornerNodes[3].id, to: cornerNodes[0].id, type: 'wall', distance: h * 2 },
  ]

  // Connect center to nearest corner
  const nearestCorner = findNearestNode(component.position, cornerNodes)
  let edges: NavEdge[] = [...wallEdges]
  if (nearestCorner) {
    edges.push({
      id: genId('E'),
      from: centerNode.id,
      to: nearestCorner.id,
      type: 'corridor',
      distance: haversine(component.position, nearestCorner.position),
    })
  }

  // Connect center to nearest hallway/intersection node
  const outdoorConnection = findNearestNode(
    component.position,
    [...existingNodes, ...cornerNodes, centerNode].filter((n) =>
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
      })
    }
  }

  return { nodes: [...cornerNodes, centerNode], edges }
}

function compileStair(component: Component, context: CompileContext): CompileResult {
  const building = context.buildings.get(component.buildingId)
  const maxFloor = building?.floors ?? 2
  const currentFloor = component.floor

  const topNode: NavNode = {
    id: genId('N'),
    name: `${component.name} (Up)`,
    type: 'staircase',
    buildingId: component.buildingId,
    floor: currentFloor + 1 <= maxFloor ? currentFloor + 1 : currentFloor,
    position: component.position,
  }

  const bottomNode: NavNode = {
    id: genId('N'),
    name: `${component.name} (Down)`,
    type: 'staircase',
    buildingId: component.buildingId,
    floor: currentFloor,
    position: component.position,
  }

  const edge: NavEdge = {
    id: genId('E'),
    from: bottomNode.id,
    to: topNode.id,
    type: 'stairs',
    distance: 4,
  }

  return { nodes: [bottomNode, topNode], edges: [edge] }
}

function compileElevator(component: Component, context: CompileContext): CompileResult {
  const building = context.buildings.get(component.buildingId)
  const totalFloors = building?.floors ?? 3

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []

  for (let f = 0; f < totalFloors; f++) {
    const node: NavNode = {
      id: genId('N'),
      name: `${component.name} (F${f})`,
      type: 'elevator',
      buildingId: component.buildingId,
      floor: f,
      position: component.position,
    }
    nodes.push(node)
    if (f > 0) {
      edges.push({
        id: genId('E'),
        from: nodes[f - 1].id,
        to: node.id,
        type: 'elevator',
        distance: 3,
      })
    }
  }

  return { nodes, edges }
}

function compileHallway(component: Component, context: CompileContext): CompileResult {
  const length = component.dimensions?.width ?? 10
  const segmentCount = Math.max(2, Math.floor(length / 5))
  const dLatPerSegment = 0
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
      name: `${component.name} ${i === 0 ? 'Start' : i === segmentCount ? 'End' : `Pt${i}`}`,
      type: 'intersection',
      buildingId: component.buildingId,
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
      })
    }
  }

  return { nodes, edges }
}

function compileEntrance(component: Component, context: CompileContext): CompileResult {
  const node: NavNode = {
    id: genId('N'),
    name: component.name,
    type: 'building_entrance',
    buildingId: component.buildingId,
    floor: component.floor,
    position: component.position,
    hasQr: component.metadata?.hasQr === true,
    hasPanorama: component.metadata?.hasPanorama === true,
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
  }
}
