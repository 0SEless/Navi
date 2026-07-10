import type { CampusDocument } from '@navi/core'
import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  ParsedDocument,
  ParsedBuilding,
  ParsedRoom,
  ParsedHallway,
  ParsedEntrance,
  ParsedStair,
  ParsedElevator,
  ParsedRoad,
} from '../../types'

/** 1-meter-in-degrees approximation near equator */
const METER_PER_DEG = 111320

function localToLatLng(
  x: number, y: number,
  originLat: number, originLng: number,
): { lat: number; lng: number } {
  return {
    lat: originLat + y / METER_PER_DEG,
    lng: originLng + x / (METER_PER_DEG * Math.cos(originLat * Math.PI / 180)),
  }
}

function footprintCentroid(footprint: { points: Array<{ lat: number; lng: number }> }): { lat: number; lng: number } | null {
  const pts = footprint.points
  if (!pts || pts.length === 0) return null
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  }
}

function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  return { x: cx, y: cy }
}

/**
 * Stage 1: Parse — Validates document structure and extracts all entities
 * into a normalized `ParsedDocument` that subsequent stages consume.
 */
export class ParseStage implements CompilerStagePlugin {
  id = 'compiler-parse-stage'
  targetStage = 'parse' as const
  mode = 'replace' as const
  meta = {
    name: 'Parse Stage',
    version: '1.0.0',
    description: 'Validates document structure and extracts entities',
  }

  execute(input: CompilerStageInput, _next: (input: CompilerStageInput) => CompilerStageOutput): CompilerStageOutput {
    const doc = input.document
    const parsed = parseDocument(doc)
    return { context: { parsed } }
  }
}

export function parseDocument(document: CampusDocument): ParsedDocument {
  const buildings: ParsedBuilding[] = []
  const rooms: ParsedRoom[] = []
  const hallways: ParsedHallway[] = []
  const entrances: ParsedEntrance[] = []
  const stairs: ParsedStair[] = []
  const elevators: ParsedElevator[] = []

  for (const bld of document.buildings) {
    const origin = footprintCentroid(bld.footprint) ?? { lat: 0, lng: 0 }

    buildings.push({
      id: bld.id,
      name: bld.name,
      code: bld.code,
      category: bld.category,
      position: origin,
      baseElevation: bld.baseElevation,
      height: bld.height,
      floors: bld.floors.map(f => f.level),
      color: bld.color,
    })

    for (const floor of bld.floors) {
      const floorId = `${bld.id}-${floor.level}`

      for (const room of floor.rooms) {
        const pts = room.polygon.points
        const localCenter = polygonCentroid(pts)
        const center = localToLatLng(localCenter.x, localCenter.y, origin.lat, origin.lng)
        const worldPoly = pts.map(p => localToLatLng(p.x, p.y, origin.lat, origin.lng))

        rooms.push({
          id: room.id,
          name: room.name,
          number: room.number,
          category: room.category,
          polygon: worldPoly,
          centroid: center,
          floorId,
          floorLevel: floor.level,
          buildingId: bld.id,
        })
      }

      for (const hw of floor.hallways) {
        const worldPts = hw.polyline.points.map(p => localToLatLng(p.x, p.y, origin.lat, origin.lng))
        hallways.push({
          id: hw.id,
          name: hw.name,
          polyline: worldPts,
          width: hw.width,
          floorId,
          floorLevel: floor.level,
          buildingId: bld.id,
        })
      }

      for (const st of floor.staircases) {
        const worldPos = localToLatLng(st.position.x, st.position.y, origin.lat, origin.lng)
        stairs.push({
          id: st.id,
          name: st.name,
          position: worldPos,
          buildingId: bld.id,
          isAccessible: true,
        })
      }

      for (const el of floor.elevators) {
        const worldPos = localToLatLng(el.position.x, el.position.y, origin.lat, origin.lng)
        elevators.push({
          id: el.id,
          name: el.name,
          position: worldPos,
          buildingId: bld.id,
          isAccessible: true,
        })
      }

      for (const ent of floor.entrances) {
        entrances.push({
          id: ent.id,
          name: ent.label,
          position: ent.position,
          level: ent.level,
          buildingId: bld.id,
          isAccessible: true,
          hasQR: ent.hasQR,
          hasPanorama: ent.hasPanorama,
        })
      }
    }
  }

  const roads: ParsedRoad[] = document.roads.map(r => ({
    id: r.id,
    name: r.name,
    polyline: r.polyline.points,
    width: r.width,
    surface: r.surface,
    type: r.type,
  }))

  return { buildings, rooms, hallways, entrances, stairs, elevators, roads }
}
