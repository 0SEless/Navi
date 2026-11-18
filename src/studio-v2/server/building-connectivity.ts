import { CampusCompiler, type ConnectivityGraph, type NavigationGraph } from '@navi/compiler'
import type { CampusDocument, POIIndex, SearchIndex } from '@navi/core'
import { isTraversalEligible, STANDARD_PEDESTRIAN_ELIGIBILITY_V1 } from '@navi/runtime/routing'
import { defaultStart } from '@/lib/default-start'
import { validateRouteNetwork } from '@navi/editor/src/validation/rules/modules/route-network'

const OUTDOORS = '__outdoor__'
type Adjacency = Map<string, string[]>
type OutdoorStatus = 'connected' | 'unassigned' | 'broken' | 'unreachable' | 'no-origin'
type IndoorStatus = 'connected' | 'room-only' | 'missing'
type FloorLinkStatus = 'indoor' | 'outdoor' | 'missing' | 'no-waypoints'
type RoomStatus = 'connected' | 'search-only' | 'unreachable' | 'no-origin'

interface GraphInput {
  document: CampusDocument
  graph: NavigationGraph
  topology: ConnectivityGraph
  ids: ReadonlyMap<string, readonly string[]>
  poiIndex?: POIIndex
  searchIndex?: SearchIndex
  routeIssues?: ReturnType<typeof validateRouteNetwork>
}

function reachableFrom(starts: Iterable<string>, adjacency: Adjacency): Set<string> {
  const seen = new Set(starts)
  const pending = [...seen]
  for (const node of pending) {
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      pending.push(next)
    }
  }
  return seen
}

function reachable(start: string | undefined, adjacency: Adjacency): Set<string> {
  return reachableFrom(start ? [start] : [], adjacency)
}

export function analyzeBuildingConnectivity(input: GraphInput, buildingId: string, roadId?: string) {
  const { document, graph, topology, ids } = input
  const building = document.buildings.find(candidate => candidate.id === buildingId)
  if (!building) throw new Error('Building not found')
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const primitiveNodes = new Map(topology.nodes.map(node => [node.id, node]))
  const roadById = new Map(document.roads.map(road => [road.id, road]))
  const firstId = (id: string) => ids.get(id)?.[0]
  const isOutdoor = (id: string) => nodes.get(id)?.buildingId === OUTDOORS
  const walk: Adjacency = new Map()
  const outdoorWalk: Adjacency = new Map()
  const localLinks: Adjacency = new Map()
  const buildingWalk: Adjacency = new Map()
  const buildingAndOutdoorsWalk: Adjacency = new Map()
  const floorWaypoints = new Map<string, Set<string>>()
  const add = (adjacency: Adjacency, from: string, to: string) => {
    const links = adjacency.get(from)
    if (links) links.push(to)
    else adjacency.set(from, [to])
  }
  for (const edge of graph.edges) {
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const source = nodes.get(from)
      const target = nodes.get(to)
      if (!source || !target || !isTraversalEligible(edge, from, STANDARD_PEDESTRIAN_ELIGIBILITY_V1)) continue
      // Visitor routing allows a room to be an endpoint only.
      if (source.type !== 'poi') {
        add(walk, from, to)
        const fromInside = source.buildingId === buildingId
        const toInside = target.buildingId === buildingId
        if (fromInside && toInside) add(buildingWalk, from, to)
        if ((fromInside || isOutdoor(from)) && (toInside || isOutdoor(to))) add(buildingAndOutdoorsWalk, from, to)
      }
      if (isOutdoor(from) && isOutdoor(to) && source.type !== 'poi') add(outdoorWalk, from, to)
      if (source.buildingId === buildingId && target.buildingId === buildingId
          && source.floor === target.floor && source.type !== 'poi' && target.type !== 'poi') {
        // Groups describe physical components on this floor. Reachability below respects travel direction.
        add(localLinks, from, to)
        add(localLinks, to, from)
      }
    }
  }

  let origin = defaultStart({ nodes: graph.nodes, poi: input.poiIndex?.points ?? [] })
  if (roadId) {
    const road = roadById.get(roadId)
    const start = topology.edges.flatMap(edge => {
      if (edge.kind !== 'skeleton' || edge.source.entityId !== roadId) return []
      const from = firstId(edge.from)
      const to = firstId(edge.to)
      if (!from || !to) return []
      if (outdoorWalk.get(from)?.includes(to)) return [from]
      return outdoorWalk.get(to)?.includes(from) ? [to] : []
    })[0]
    origin = road && start ? { nodeId: start, label: road.name?.trim() || road.id } : null
  }
  const outsideReached = reachable(origin?.nodeId, outdoorWalk)
  const reached = reachable(origin?.nodeId, walk)

  const floors = [...building.floors].sort((a, b) => a.level - b.level).map(floor => {
    const waypoints = topology.nodes.filter(node => node.buildingId === buildingId && node.floor === floor.level && node.kind === 'waypoint')
    const represented = new Set<string>()
    const waypointIds = new Set(waypoints.map(node => firstId(node.id)).filter((id): id is string => Boolean(id)))
    floorWaypoints.set(floor.id, waypointIds)
    const groups = waypoints.flatMap(node => {
      const start = firstId(node.id)
      if (!start || represented.has(start)) return []
      const group = [...reachable(start, localLinks)].filter(id => waypointIds.has(id))
      group.forEach(id => represented.add(id))
      return [{ waypointId: node.source.entityId, total: group.length, reachable: group.filter(id => reached.has(id)).length }]
    }).sort((a, b) => b.total - a.total || a.reachable - b.reachable || a.waypointId.localeCompare(b.waypointId))

    const entrances = (floor.entrances ?? []).map(entrance => {
      const access = floor.entranceAccess?.find(candidate => candidate.entranceId === entrance.id)
      const portal = topology.nodes.find(node => node.kind === 'entrance_portal' && node.buildingId === buildingId
        && node.floor === floor.level && node.entranceId === entrance.id)
      let outdoorNode: string | undefined
      let indoorNode: string | undefined
      let outdoorRoadId = access?.outdoorRouteId
      for (const edge of topology.edges) {
        if (edge.kind !== 'access' || edge.source.entityId !== entrance.id) continue
        const inside = primitiveNodes.get(edge.to)
        if (edge.accessType === 'entrance_bridge' && inside?.buildingId === buildingId && inside.floor === floor.level) {
          outdoorNode = firstId(edge.from)
          indoorNode = firstId(edge.to)
          outdoorRoadId ??= primitiveNodes.get(edge.from)?.source.entityId
        } else if (portal && edge.from === portal.id && edge.accessType === 'entrance_road_link') {
          outdoorNode = firstId(edge.to)
          outdoorRoadId ??= primitiveNodes.get(edge.to)?.source.entityId
        } else if (portal && edge.from === portal.id && edge.accessType === 'entrance') {
          indoorNode = firstId(edge.to)
        }
      }
      const assigned = Boolean(access || outdoorNode || (portal?.kind === 'entrance_portal' && portal.connectorRoadId))
      const outdoor: OutdoorStatus = !assigned ? 'unassigned' : !outdoorNode ? 'broken'
        : !origin ? 'no-origin' : outsideReached.has(outdoorNode) ? 'connected' : 'unreachable'
      const insideFloor = indoorNode ? [...reachable(indoorNode, localLinks)] : []
      const hasHallway = insideFloor.some(id => id !== indoorNode && waypointIds.has(id))
      const hasRoom = insideFloor.some(id => walk.get(id)?.some(next => nodes.get(next)?.buildingId === buildingId && nodes.get(next)?.type === 'poi'))
      const indoor: IndoorStatus = hasHallway ? 'connected' : hasRoom ? 'room-only' : 'missing'
      const road = outdoorRoadId ? roadById.get(outdoorRoadId) : undefined
      return { id: entrance.id, label: entrance.label || 'Entrance', road: road ? road.name?.trim() || road.id : null, outdoor, indoor }
    })
    const rooms = (input.searchIndex?.entries ?? []).filter(entry =>
      entry.type === 'room' && entry.buildingId === buildingId && entry.floor === floor.level,
    ).map(entry => {
      const status: RoomStatus = !entry.nodeId ? 'search-only' : !origin ? 'no-origin' : reached.has(entry.nodeId) ? 'connected' : 'unreachable'
      return { id: entry.id, label: entry.label, status }
    })
    const linkedFloors = new Set<number>()
    for (const edge of graph.edges) {
      const from = nodes.get(edge.from)
      const to = nodes.get(edge.to)
      if (from?.buildingId !== buildingId || to?.buildingId !== buildingId || from.floor === to.floor) continue
      if (from.floor === floor.level) linkedFloors.add(to.floor)
      if (to.floor === floor.level) linkedFloors.add(from.floor)
    }
    const transitions = building.floors.filter(candidate => linkedFloors.has(candidate.level)).map(candidate => candidate.label || `Floor ${candidate.level}`)
    const issues = (input.routeIssues ?? []).filter(issue => issue.buildingId === buildingId && issue.floorId === floor.id)
      .map(issue => ({ id: issue.issueId, message: issue.message }))
    return { id: floor.id, level: floor.level, label: floor.label || `Floor ${floor.level}`, groups, entrances, rooms, transitions, issues }
  })
  const floorReach = new Map(floors.map(floor => {
    const starts = floorWaypoints.get(floor.id) ?? []
    return [floor.id, {
      indoor: reachableFrom(starts, buildingWalk),
      withOutdoor: reachableFrom(starts, buildingAndOutdoorsWalk),
    }] as const
  }))
  function floorLinkStatus(from: string, to: string): FloorLinkStatus {
    const destinations = floorWaypoints.get(to)
    const reach = floorReach.get(from)
    if (!reach?.indoor.size || !destinations?.size) return 'no-waypoints'
    if ([...destinations].some(id => reach.indoor.has(id))) return 'indoor'
    return [...destinations].some(id => reach.withOutdoor.has(id)) ? 'outdoor' : 'missing'
  }
  const floorLinks = floors.flatMap((from, index) => floors.slice(index + 1).map(to => ({
    from: from.id, to: to.id,
    forward: floorLinkStatus(from.id, to.id), reverse: floorLinkStatus(to.id, from.id),
  })))
  return { buildingId, buildingName: building.name, origin, floors, floorLinks }
}

export type BuildingConnectivityReport = ReturnType<typeof analyzeBuildingConnectivity>

export function validateBuildingConnectivity(document: CampusDocument, buildingId: string, roadId?: string) {
  const capture: Pick<GraphInput, 'topology' | 'ids'>[] = []
  const result = new CampusCompiler().compileV2(document, (topology, ids) => capture.push({ topology, ids }))
  const graphInfo = capture[0]
  if (!result.graph || !graphInfo) return null
  return analyzeBuildingConnectivity({
    ...graphInfo, document, graph: result.graph, poiIndex: result.artifacts?.poiIndex, searchIndex: result.artifacts?.searchIndex,
    routeIssues: validateRouteNetwork(document, 'publish'),
  }, buildingId, roadId)
}
