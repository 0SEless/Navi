import type { Diagnostic, TopologyRule } from '../diagnostic-types'
import type { CampusDocument } from '@navi/core'
import { TOPOLOGY_THRESHOLDS } from '../thresholds'

function pointDistance(a: { lat: number; lng: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.lng - b.x) ** 2 + (a.lat - b.y) ** 2)
}

function nearestHallwayEntranceDist(entPos: { lat: number; lng: number }, floor: any): number {
  let minDist = Infinity
  for (const hw of floor.hallways || []) {
    for (const pt of hw.polyline?.points || []) {
      minDist = Math.min(minDist, pointDistance(entPos, pt))
    }
  }
  return minDist === Infinity ? Infinity : minDist
}

export const EntranceRule: TopologyRule = {
  id: 'entrance-connection',
  description: 'Warn if an entrance is not connected to a hallway',
  check(document: CampusDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    let idCounter = 0
    for (const building of document.buildings) {
      for (const floor of building.floors) {
        for (const ent of floor.entrances || []) {
          const dist = nearestHallwayEntranceDist(ent.position, floor)
          if (dist > TOPOLOGY_THRESHOLDS.entranceHallwayMaxDistance) {
            diagnostics.push({
              id: `diag-${++idCounter}`, code: 'TOPOLOGY_ENTRANCE_UNATTACHED',
              category: 'topology', severity: 'info',
              title: 'Unattached Entrance',
              message: `Entrance "${ent.label || ent.id}" is ${Math.round(dist)}m from the nearest hallway`,
              provider: 'topology', rule: 'entrance-connection',
              target: {
                entityType: 'entrance', entityId: ent.id,
                buildingId: building.id, floorId: floor.id,
              },
            })
          }
        }
      }
    }
    return diagnostics
  },
}
