import type { PrimitiveContribution, NormalizedDocument, GenerationContext, CompilerDiagnostic } from '../types'
import { nextCompilerId as nextId } from '../ids'


export function extractRooms(document: NormalizedDocument, _context: GenerationContext): PrimitiveContribution {
  const nodes = []
  const diagnostics: CompilerDiagnostic[] = []

  for (const building of document.buildings) {
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        const id = nextId('POI')
        nodes.push({
          id,
          kind: 'poi' as const,
          // "Name (number)", or just the name when the room has no number (2026-11-18: no "ED101 ()").
          label: room.number && room.number.trim() !== room.name.trim() ? `${room.name} (${room.number})` : room.name,
          position: room.centroid,
          floor: floor.level,
          buildingId: building.id,
          poiCategory: 'room',
          source: {
            entityId: room.id,
            entityType: 'room',
            field: 'centroid',
            generatorId: 'builtin:room-extractor',
          },
        })

        if (room.doors.length === 0) {
          diagnostics.push({
            severity: 'info',
            sourceEntityId: room.id,
            phase: 'primitives',
            code: 'ROOM_NO_DOOR',
            message: `Room "${room.name}" has no RoomDoor — using centroid fallback`,
            relatedNodeIds: [id],
          })
        }
      }
    }
  }

  return { nodes, diagnostics }
}
