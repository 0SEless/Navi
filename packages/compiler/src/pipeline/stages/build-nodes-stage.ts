import type { CampusDocument } from '@navi/core'
import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  NavNode,
  ParsedDocument,
} from '../../types'

/**
 * Stage 2: Build Nodes — Creates graph nodes from rooms, hallways,
 * entrances, stairs, elevators, roads, panoramas, and QR checkpoints.
 */
export class BuildNodesStage implements CompilerStagePlugin {
  id = 'compiler-build-nodes-stage'
  targetStage = 'build-nodes' as const
  mode = 'replace' as const
  meta = {
    name: 'Build Nodes Stage',
    version: '1.0.0',
    description: 'Creates graph nodes from parsed entities',
  }

  execute(input: CompilerStageInput, _next: (input: CompilerStageInput) => CompilerStageOutput): CompilerStageOutput {
    const doc = input.document
    const parsed = input.context?.parsed as ParsedDocument | undefined
    if (!parsed) {
      return { errors: [{ code: 'NO_PARSED_DOC', message: 'BuildNodesStage requires parsed document in context' }] }
    }

    const nodes = buildNodes(doc, parsed)
    return { nodes }
  }
}

function makeId(type: string, idx: number): string {
  return `${type}-${idx}`
}

export function buildNodes(document: CampusDocument, parsed: ParsedDocument): NavNode[] {
  const nodes: NavNode[] = []
  let idx = 0

  // Rooms → nodes (one per room, positioned at centroid)
  for (const room of parsed.rooms) {
    nodes.push({
      id: makeId('node', idx++),
      label: room.name || room.number || `Room ${room.id}`,
      type: 'space',
      position: room.centroid,
      floor: room.floorLevel,
      buildingId: room.buildingId,
      properties: { number: room.number, category: room.category, entityType: 'room', entityId: room.id },
    })
  }

  // Hallways → nodes (one per hallway midpoint)
  for (const hw of parsed.hallways) {
    if (hw.polyline.length === 0) continue
    const midIdx = Math.floor(hw.polyline.length / 2)
    const midpoint = hw.polyline[midIdx]
    nodes.push({
      id: makeId('node', idx++),
      label: hw.name,
      type: 'corridor',
      position: midpoint,
      floor: hw.floorLevel,
      buildingId: hw.buildingId,
      properties: { entityType: 'hallway', entityId: hw.id, width: hw.width },
    })
  }

  // Entrances → nodes
  for (const ent of parsed.entrances) {
    nodes.push({
      id: makeId('node', idx++),
      label: ent.name || 'Entrance',
      type: 'transition',
      position: ent.position,
      floor: ent.level,
      buildingId: ent.buildingId,
      properties: { entityType: 'entrance', entityId: ent.id, isAccessible: ent.isAccessible },
    })
  }

  // Stairs → nodes
  for (const st of parsed.stairs) {
    nodes.push({
      id: makeId('node', idx++),
      label: st.name || 'Stairs',
      type: 'transition',
      position: st.position,
      floor: 0,
      buildingId: st.buildingId,
      properties: { entityType: 'staircase', entityId: st.id, isAccessible: st.isAccessible, isElevation: true },
    })
  }

  // Elevators → nodes
  for (const el of parsed.elevators) {
    nodes.push({
      id: makeId('node', idx++),
      label: el.name || 'Elevator',
      type: 'transition',
      position: el.position,
      floor: 0,
      buildingId: el.buildingId,
      properties: { entityType: 'elevator', entityId: el.id, isAccessible: el.isAccessible, isElevation: true },
    })
  }

  // Roads → nodes (road endpoints as corridor nodes)
  for (const road of parsed.roads) {
    if (road.polyline.length >= 2) {
      nodes.push({
        id: makeId('node', idx++),
        label: `${road.name} start`,
        type: 'corridor',
        position: road.polyline[0],
        floor: 0,
        buildingId: '',
        properties: { entityType: 'road', entityId: road.id, endpoint: 'start' },
      })
      nodes.push({
        id: makeId('node', idx++),
        label: `${road.name} end`,
        type: 'corridor',
        position: road.polyline[road.polyline.length - 1],
        floor: 0,
        buildingId: '',
        properties: { entityType: 'road', entityId: road.id, endpoint: 'end' },
      })
    }
  }

  // Panorama nodes
  for (const pano of document.panoramas) {
    nodes.push({
      id: makeId('node', idx++),
      label: `Panorama: ${pano.label}`,
      type: 'intersection',
      position: pano.position,
      floor: pano.floor ?? 0,
      buildingId: pano.buildingId ?? '',
      properties: { entityType: 'panorama', entityId: pano.id, hasPanorama: true },
    })
  }

  // QR Checkpoint nodes
  for (const qr of document.qrCheckpoints) {
    nodes.push({
      id: makeId('node', idx++),
      label: `QR: ${qr.label}`,
      type: 'intersection',
      position: qr.position,
      floor: qr.floor,
      buildingId: qr.buildingId,
      properties: { entityType: 'qr', entityId: qr.id, hasQr: true },
    })
  }

  return nodes
}
