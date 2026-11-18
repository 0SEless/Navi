import type { Floor, Staircase } from '@navi/core'
import { canonicalJson } from '../parts/canonical'
import { partKey, type PartKey } from '../parts/part-keys'

type FloorState = Pick<Floor, 'level' | 'label' | 'routeNetwork' | 'openings' | 'entranceAccess' | 'entrances'>
export type StairPartState = { stairs: Staircase[] } | { floor: FloorState }

/** Record only the part content needed to identify edits to a stair relationship. */
export function stairPartState(key: PartKey, content: unknown): StairPartState | undefined {
  if (!content || typeof content !== 'object') return undefined
  if (key.startsWith('building:')) {
    const stairs = (content as { building?: { staircases?: Staircase[] } }).building?.staircases
    if (stairs?.length) return { stairs: structuredClone(stairs) }
  }
  if (key.startsWith('floor:')) {
    const { level, label, routeNetwork, openings, entranceAccess, entrances } = content as Floor
    return { floor: structuredClone({ level, label, routeNetwork, openings, entranceAccess, entrances }) }
  }
}

function floorRelationship(stair: Staircase | undefined, floor: FloorState | undefined): unknown {
  if (!stair || !floor) return null
  const connection = stair.levels?.[floor.level]?.routeConnection
  const footId = `stair-foot-${stair.id}`
  const access = floor.entranceAccess?.find(entry => entry.entranceId === footId)
  const foot = floor.entrances?.find(entry => entry.id === footId)
  const nodeIds = [connection?.anchorNodeId, connection?.targetRouteNodeId, access?.indoorRouteNodeId, foot?.routeNodeId]
  return {
    nodes: floor.routeNetwork?.nodes.filter(node => nodeIds.includes(node.id)) ?? [],
    edges: floor.routeNetwork?.edges.filter(edge => edge.id === connection?.connectorEdgeId || nodeIds.includes(edge.from) || nodeIds.includes(edge.to)) ?? [],
    openings: floor.openings?.filter(opening => opening.metadata?.stairId === stair.id) ?? [],
    access: access ?? null,
    foot: foot ?? null,
  }
}

/** A changed stair plus its old and new floor versions form one save unit. */
export interface StairSaveGroup { keys: PartKey[]; problem?: string }

export function staircaseSaveGroups(before: ReadonlyMap<PartKey, StairPartState>, after: ReadonlyMap<PartKey, StairPartState>, dirty: ReadonlySet<PartKey>): StairSaveGroup[] {
  const keys = new Set([...before.keys(), ...after.keys()])
  const groups: StairSaveGroup[] = []
  for (const key of keys) {
    if (!key.startsWith('building:')) continue
    const previous = before.get(key), current = after.get(key)
    const oldStairs = previous && 'stairs' in previous ? previous.stairs : []
    const newStairs = current && 'stairs' in current ? current.stairs : []
    if (oldStairs.length + newStairs.length === 0) continue

    const floorPrefix = `floor:${key.slice('building:'.length)}:`
    const floors = [...keys].filter(floor => floor.startsWith(floorPrefix)).map(floorKey => {
      const oldPart = before.get(floorKey), newPart = after.get(floorKey)
      return { key: floorKey, before: oldPart && 'floor' in oldPart ? oldPart.floor : undefined,
        after: newPart && 'floor' in newPart ? newPart.floor : undefined }
    })
    const group = new Set<PartKey>()
    let problem: string | undefined
    for (const id of new Set([...oldStairs, ...newStairs].map(stair => stair.id))) {
      const oldStair = oldStairs.find(stair => stair.id === id), newStair = newStairs.find(stair => stair.id === id)
      const stairChanged = dirty.has(key) && canonicalJson(oldStair ?? null) !== canonicalJson(newStair ?? null)
      const related = floors.filter(floor => {
        const belongs = (stair: Staircase | undefined, part: FloorState | undefined) => !!(stair && part && (
          stair.levels?.[part.level] || part.openings?.some(opening => opening.metadata?.stairId === id)
          || part.entranceAccess?.some(access => access.entranceId === `stair-foot-${id}`)))
        return belongs(oldStair, floor.before) || belongs(newStair, floor.after)
      })
      const relatedEdit = related.some(floor => dirty.has(floor.key) &&
        canonicalJson(floorRelationship(oldStair, floor.before)) !== canonicalJson(floorRelationship(newStair, floor.after)))
      if (!stairChanged && !relatedEdit) continue
      group.add(key)
      for (const [level, geometry] of Object.entries(newStair?.levels ?? {})) {
        const link = geometry.routeConnection
        if (!link) continue
        const floor = related.find(floor => floor.after?.level === Number(level))?.after
        const network = floor?.routeNetwork
        const edge = network?.edges.find(edge => edge.id === link.connectorEdgeId)
        const ends = edge ? [edge.from, edge.to] : []
        const valid = [link.anchorNodeId, link.targetRouteNodeId].every(id =>
          ends.includes(id) && network?.nodes.some(node => node.id === id))
        if (!valid) problem ??= `Reconnect ${newStair?.name ?? id} on ${floor?.label ?? `level ${level}`} before saving. Its floor route changed.`
      }
      for (const floor of related) {
        group.add(floor.key)
        for (const entry of [...(floor.before?.entranceAccess ?? []), ...(floor.after?.entranceAccess ?? [])]) {
          if (entry.entranceId !== `stair-foot-${id}` || !entry.outdoorRouteId) continue
          const road = partKey('map/road', entry.outdoorRouteId)
          if (dirty.has(road)) group.add(road)
        }
      }
    }
    if (group.size) groups.push({ keys: [...group], problem })
  }
  return groups
}
