import type { RoomDoor } from '../types/entities'
import type { DoorOperation, GlassType, HingeSide, OpeningMaterial, SwingSide, WindowAppearance, WindowPose } from '../types/enums'
import { findDoorPreset, findWindowPreset } from './opening-catalog'

/** Effective, fully-defaulted look of a door. Decorative only: navigation never reads it. */
export interface DoorStyle {
  operation: DoorOperation
  leaves: 1 | 2
  hingeSide: HingeSide
  swingSide: SwingSide
  pose: 'closed' | 'ajar' | 'open'
  panel: 'solid' | 'glass' | 'half-glass' | 'none'
  material: OpeningMaterial | null
  glass: GlassType
  fire: boolean
}

export type DoorStyleInput = Partial<Pick<RoomDoor, 'doorType' | 'doorAppearance' | 'doorPose' | 'doorOperation' | 'hingeSide' | 'swingSide'>> & {
  assetPreset?: string
  material?: OpeningMaterial
  glass?: GlassType
}

/**
 * Stored fields -> effective style. Absent fields reproduce today's rendering:
 * hinge at the start end, swing to the left side, closed, solid (double-solid for double doors).
 * Precedence for operation: archway (doorType 'opening' or appearance 'open') > explicit
 * doorOperation > doorType ('sliding' slides) > hinged.
 */
export function resolveDoorStyle(door: DoorStyleInput): DoorStyle {
  const appearance = door.doorAppearance
  const preset = findDoorPreset(door.assetPreset)
  // A chosen preset overrides the legacy 'open' look on a real door; doorType 'opening' is always an archway.
  const archway = door.doorType === 'opening' || (appearance === 'open' && !preset)
  // Precedence: archway > explicit doorOperation > catalog preset > doorType > hinged.
  const operation: DoorOperation = archway ? 'none' : door.doorOperation ?? preset?.operation ?? (door.doorType === 'sliding' ? 'sliding' : 'hinged')
  // A chosen preset (the newer catalog UI) wins over the legacy doorAppearance for leaves and panel.
  const leaves: 1 | 2 = preset ? preset.leaves
    : appearance === 'double-solid' || appearance === 'double-glass' || (appearance === undefined && door.doorType === 'double') ? 2 : 1
  const panel: DoorStyle['panel'] = operation === 'none' ? 'none'
    : preset ? (preset.panel === 'none' ? 'solid' : preset.panel)
    : appearance === 'glass' || appearance === 'double-glass' ? 'glass' : 'solid'
  return {
    operation,
    leaves,
    hingeSide: door.hingeSide ?? 'start',
    swingSide: door.swingSide ?? 'left',
    pose: door.doorPose ?? 'closed',
    panel,
    material: door.material ?? preset?.material ?? null,
    glass: door.glass ?? preset?.glass ?? 'clear',
    fire: door.doorType === 'fire' || preset?.fire === true,
  }
}

/** Effective, fully-defaulted look of a window. Decorative only. */
export interface WindowStyle {
  type: WindowAppearance
  pose: WindowPose
  material: OpeningMaterial | null
  glass: GlassType
}

export interface WindowStyleInput {
  windowAppearance?: WindowAppearance
  windowPose?: WindowPose
  assetPreset?: string
  material?: OpeningMaterial
  glass?: GlassType
}

/** Stored fields -> effective window look. A chosen preset wins over windowAppearance (as for doors); absent = today's open window. */
export function resolveWindowStyle(opening: WindowStyleInput): WindowStyle {
  const preset = findWindowPreset(opening.assetPreset)
  return {
    type: preset?.type ?? opening.windowAppearance ?? 'open',
    pose: opening.windowPose ?? 'closed',
    material: opening.material ?? preset?.material ?? null,
    glass: opening.glass ?? preset?.glass ?? 'clear',
  }
}
