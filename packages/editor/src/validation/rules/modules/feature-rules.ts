import type { ValidationRule, ValidationContext } from '../types'
import type { ValidationIssue } from '../../snapshot'
import { pointInPolygon, stairFlightFloor } from '@navi/core'
import { detachedStairCutouts, stairTopReach } from '../../../geometry/stair-top-reach'

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Feature Extent & Endpoints Rule
 * - fromLevel <= toLevel
 * - levels keys ⊆ [fromLevel..toLevel]
 * - Endpoint rule: levels[fromLevel] and levels[toLevel] must exist
 */
export const featureExtentRule: ValidationRule = {
  ruleId: 'feature-extent',
  description: 'Staircase / Elevator Extent & Endpoint Rule',
  category: 'connectivity',
  defaultSeverity: 'warning',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:feature',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []

    for (const bld of context.document.buildings) {
      const features = [...(bld.staircases ?? []), ...(bld.elevators ?? [])]
      for (const feature of features) {
        const entityType = 'type' in feature && typeof feature.type === 'string' && ['standard', 'enclosed', 'open', 'spiral', 'fire_escape'].includes(feature.type)
          ? 'staircase'
          : 'elevator'

        if (feature.fromLevel > feature.toLevel) {
          issues.push({
            issueId: `feature-extent:${feature.id}:${hash('invalid-range')}`,
            ruleId: 'feature-extent',
            severity: 'error',
            message: `${entityType} "${feature.id}" has invalid extent: fromLevel (${feature.fromLevel}) > toLevel (${feature.toLevel})`,
            targets: [{ entityId: feature.id, entityType }],
          })
        }

        const levelsKeys = Object.keys(feature.levels).map(Number)
        for (const lvl of levelsKeys) {
          if (lvl < feature.fromLevel || lvl > feature.toLevel) {
            issues.push({
              issueId: `feature-extent:${feature.id}:${hash(`level-out-of-range-${lvl}`)}`,
              ruleId: 'feature-extent',
              severity: 'error',
              message: `${entityType} "${feature.id}" has access floor ${lvl} outside extent [${feature.fromLevel}..${feature.toLevel}]`,
              targets: [{ entityId: feature.id, entityType }],
            })
          }
        }

        // Endpoint rule: both fromLevel and toLevel must be access floors
        if (!feature.levels[feature.fromLevel]) {
          issues.push({
            issueId: `feature-extent:${feature.id}:${hash(`missing-endpoint-${feature.fromLevel}`)}`,
            ruleId: 'feature-extent',
            severity: 'warning',
            message: `${entityType} "${feature.id}" spans to floor ${feature.fromLevel} but has no access/geometry on that floor`,
            targets: [{ entityId: feature.id, entityType }],
          })
        }
        if (feature.toLevel !== feature.fromLevel && !feature.levels[feature.toLevel]) {
          issues.push({
            issueId: `feature-extent:${feature.id}:${hash(`missing-endpoint-${feature.toLevel}`)}`,
            ruleId: 'feature-extent',
            severity: 'warning',
            message: `${entityType} "${feature.id}" spans to floor ${feature.toLevel} but has no access/geometry on that floor`,
            targets: [{ entityId: feature.id, entityType }],
          })
        }
      }
    }

    return issues
  },
}

/**
 * Feature Overlap Rule
 * - Feature level polygon must not overlap room polygons on the same floor
 */
export const featureOverlapRule: ValidationRule = {
  ruleId: 'feature-overlap',
  description: 'Staircase / Elevator Overlap with Rooms',
  category: 'geometry',
  defaultSeverity: 'error',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:feature',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []

    for (const bld of context.document.buildings) {
      const features = [...(bld.staircases ?? []), ...(bld.elevators ?? [])]
      for (const feature of features) {
        const entityType = 'type' in feature && typeof feature.type === 'string' && ['standard', 'enclosed', 'open', 'spiral', 'fire_escape'].includes(feature.type)
          ? 'staircase'
          : 'elevator'

        for (const [lvlKey, levelGeom] of Object.entries(feature.levels)) {
          const level = Number(lvlKey)
          const floor = bld.floors.find(f => f.level === level)
          if (!floor || !levelGeom.polygon) continue

          for (const room of floor.rooms) {
            if (!room.polygon || room.polygon.points.length < 3) continue

            // Check if any vertex of feature is inside room polygon
            let overlapping = false
            for (const pt of levelGeom.polygon.points) {
              if (pointInPolygon(pt, room.polygon)) {
                overlapping = true
                break
              }
            }

            if (overlapping) {
              issues.push({
                issueId: `feature-overlap:${feature.id}:${room.id}:${hash(`overlap-${level}`)}`,
                ruleId: 'feature-overlap',
                severity: 'error',
                message: `${entityType} "${feature.id}" on floor ${level} overlaps with room "${room.name || room.number || room.id}"`,
                targets: [
                  { entityId: feature.id, entityType },
                  { entityId: room.id, entityType: 'room' },
                ],
              })
            }
          }
        }
      }
    }

    return issues
  },
}

/**
 * Feature Connectivity Rule
 * - Feature level position / landing must be within reasonable distance of a hallway on that floor
 */
export const featureConnectivityRule: ValidationRule = {
  ruleId: 'feature-connectivity',
  description: 'Staircase / Elevator Hallway Connection',
  category: 'connectivity',
  defaultSeverity: 'error',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:feature',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []
    const MAX_HALLWAY_DISTANCE = 8 // meters

    for (const bld of context.document.buildings) {
      const features = [...(bld.staircases ?? []), ...(bld.elevators ?? [])]
      for (const feature of features) {
        const entityType = 'type' in feature && typeof feature.type === 'string' && ['standard', 'enclosed', 'open', 'spiral', 'fire_escape'].includes(feature.type)
          ? 'staircase'
          : 'elevator'

        for (const [lvlKey, levelGeom] of Object.entries(feature.levels)) {
          const level = Number(lvlKey)
          const floor = bld.floors.find(f => f.level === level)
          if (!floor) continue

          // Walkable points on this floor: legacy hallway polylines plus the
          // floor route network (Save v2 draws indoor routes there and leaves
          // Floor.hallways empty). Both are building-local meters.
          const walkPoints: Array<{ x: number; y: number }> = []
          for (const hw of floor.hallways ?? []) walkPoints.push(...(hw.polyline?.points ?? []))
          for (const node of floor.routeNetwork?.nodes ?? []) {
            if (node?.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) walkPoints.push(node.position)
          }

          if (walkPoints.length === 0) {
            issues.push({
              issueId: `feature-connectivity:${feature.id}:${hash(`no-hallways-${level}`)}`,
              ruleId: 'feature-connectivity',
              severity: 'error',
              message: `${entityType === 'staircase' ? 'Stair' : 'Lift'} "${feature.name || 'unnamed'}" on ${floor.label || `floor ${level}`} has no hallway route on that floor to join.`,
              targets: [{ entityId: feature.id, entityType }],
              buildingId: bld.id, floorId: floor.id, layer: 'navigation',
            })
            continue
          }

          const targetPos = levelGeom.landing?.position ?? levelGeom.position
          let minDist = Infinity
          for (const pt of walkPoints) {
            const d = pointDistance(targetPos, pt)
            if (d < minDist) minDist = d
          }

          if (minDist > MAX_HALLWAY_DISTANCE) {
            issues.push({
              issueId: `feature-connectivity:${feature.id}:${hash(`far-hallway-${level}`)}`,
              ruleId: 'feature-connectivity',
              severity: 'error',
              message: `${entityType === 'staircase' ? 'Stair' : 'Lift'} "${feature.name || 'unnamed'}" on ${floor.label || `floor ${level}`} is ${Math.round(minDist)} m from the nearest hallway route (at most ${MAX_HALLWAY_DISTANCE} m).`,
              targets: [{ entityId: feature.id, entityType }],
              buildingId: bld.id, floorId: floor.id, layer: 'navigation',
            })
          }
        }
      }
    }

    return issues
  },
}

/**
 * Unconnected stairs and lifts (2026-11-08): each floor draws its own stair or lift and connects it to the one below or
 * above (links). One that connects nothing, in a building with more than one floor, takes no one anywhere. A warning.
 */
export const featureUnconnectedRule: ValidationRule = {
  ruleId: 'feature-unconnected',
  description: 'Stairs and lifts connect to another floor',
  category: 'connectivity',
  defaultSeverity: 'warning',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:building',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []
    for (const bld of context.document.buildings) {
      if ((bld.floors ?? []).length < 2) continue
      const labelOf = (level: number) => bld.floors.find((f) => f.level === level)?.label ?? `floor ${level}`
      const groups: Array<{ kind: 'staircase' | 'elevator'; word: string; items: Array<{ id: string; name: string; levels: Record<number, unknown>; links?: { below?: string; above?: string } }> }> = [
        { kind: 'staircase', word: 'Stair', items: bld.staircases ?? [] },
        { kind: 'elevator', word: 'Lift', items: bld.elevators ?? [] },
      ]
      for (const { kind, word, items } of groups) {
        const floorsOf = (item: (typeof items)[number]) => Object.keys(item.levels ?? {}).map(Number).filter(Number.isInteger)
        // A link counts as the compiler counts it: the partner exists, links back, and is on the very next floor.
        const joined = (item: (typeof items)[number], side: 'below' | 'above') => {
          const partner = item.links?.[side] ? items.find((other) => other.id === item.links?.[side]) : undefined
          if (!partner || partner.links?.[side === 'below' ? 'above' : 'below'] !== item.id) return false
          const mine = floorsOf(item)
          const theirs = floorsOf(partner)
          if (mine.length === 0 || theirs.length === 0) return false
          return side === 'below' ? Math.max(...theirs) + 1 === Math.min(...mine) : Math.min(...theirs) === Math.max(...mine) + 1
        }
        for (const feature of items) {
          const floors = floorsOf(feature)
          if (floors.length !== 1) continue // older multi-floor items connect their own floors
          if (joined(feature, 'below') || joined(feature, 'above')) continue
          issues.push({
            issueId: `feature-unconnected:${feature.id}:${hash(feature.id)}`,
            ruleId: 'feature-unconnected',
            severity: 'warning',
            message: `${word} "${feature.name || feature.id}" on ${labelOf(floors[0])} isn't connected to another floor`,
            targets: [{ entityId: feature.id, entityType: kind }],
          })
        }
      }
    }
    return issues
  },
}

/**
 * Stair top reach (2026-11-16): a stair that climbs to a floor must land on that floor's walkable area (hallway,
 * balcony, room or a space its walls enclose), within 1.5 m.
 */
export const stairTopReachRule: ValidationRule = {
  ruleId: 'stair-top-reach',
  description: "A stair's top lands on the floor it climbs to",
  category: 'connectivity',
  defaultSeverity: 'warning',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:building',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []
    for (const bld of context.document.buildings) {
      const stairs = bld.staircases ?? []
      const stairIds = new Set(stairs.map(stair => stair.id))
      for (const floor of bld.floors) {
        for (const opening of floor.openings ?? []) {
          const id = opening.metadata?.stairId
          if (typeof id !== 'string' || stairIds.has(id)) continue
          issues.push({
            issueId: `stair-cutout-detached:${floor.id}:${opening.id}`,
            ruleId: 'stair-top-reach', severity: 'warning',
            message: `Review the stair cutout on ${floor.label}. Its stair was removed.`,
            targets: [{ entityId: opening.id, entityType: 'opening' }],
          })
        }
      }
      for (const stair of stairs) {
        const reach = stairTopReach(bld, stair)
        for (const { floor, opening } of detachedStairCutouts(bld, stair, reach)) {
          issues.push({
            issueId: `stair-cutout-detached:${floor.id}:${opening.id}`,
            ruleId: 'stair-top-reach', severity: 'warning',
            message: `${stair.name || stair.id}: Review the detached stair cutout on ${floor.label}.`,
            targets: [{ entityId: stair.id, entityType: 'staircase' }],
            buildingId: bld.id, floorId: floor.id,
          })
        }
        // Only stairs set to climb To a floor (their upper floor holds a top); older multi-floor stairs are left as they are.
        if (!(stair.toLevel > stairFlightFloor(stair)) || !Object.values(stair.levels ?? {}).some((l) => l?.role === 'top')) continue
        if (reach.ok) continue
        const toFloor = bld.floors.find((f) => f.level === stair.toLevel)
        const label = toFloor?.label ?? `floor ${stair.toLevel}`
        issues.push({
          issueId: `stair-top-reach:${stair.id}:${hash(stair.id)}`,
          ruleId: 'stair-top-reach',
          severity: 'warning',
          message: reach.reason === 'no-opening' ? `${stair.name || stair.id}: Top meets a wall with no opening on ${label}` : `${stair.name || stair.id}: Top doesn't reach ${label}'s hallway`,
          targets: [{ entityId: stair.id, entityType: 'staircase' }],
          // The problem is on the floor the top arrives at (owner 2026-11-19: say which floor).
          buildingId: bld.id, ...(toFloor ? { floorId: toFloor.id } : {}), layer: 'navigation',
        })
      }
    }
    return issues
  },
}
