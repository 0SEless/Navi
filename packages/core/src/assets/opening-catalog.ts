import type { DoorOperation, GlassType, OpeningMaterial, WindowAppearance } from '../types/enums'

/** Built-in library only (owner rule): fixed presets and palette, no uploads. Decorative only. */
export const OPENING_MATERIAL_COLORS: Record<OpeningMaterial, string> = {
  wood: '#8B5E3C',
  'painted-steel': '#6B7280',
  aluminium: '#C0C7CF',
  'fire-red': '#B91C1C',
}
export const GLASS_STYLES: Record<GlassType, { color: string; opacity: number }> = {
  clear: { color: '#7DD3FC', opacity: 0.35 },
  frosted: { color: '#F8FAFC', opacity: 0.55 },
  tinted: { color: '#64748B', opacity: 0.45 },
}

export interface DoorPreset {
  id: string
  label: string
  operation: DoorOperation
  leaves: 1 | 2
  panel: 'solid' | 'glass' | 'half-glass' | 'none'
  material: OpeningMaterial | null
  glass: GlassType
  fire?: true
  defaultWidth: number
  defaultHeight: number
}

const preset = (id: string, label: string, operation: DoorOperation, leaves: 1 | 2, panel: DoorPreset['panel'], material: OpeningMaterial | null, defaultWidth: number, extra: Partial<DoorPreset> = {}): DoorPreset =>
  ({ id, label, operation, leaves, panel, material, glass: 'clear', defaultWidth, defaultHeight: 2.1, ...extra })

export const DOOR_PRESETS: readonly DoorPreset[] = [
  preset('door.wood.single', 'Wood door', 'hinged', 1, 'solid', 'wood', 0.9),
  preset('door.wood.half-glass', 'Half-glass wood door', 'hinged', 1, 'half-glass', 'wood', 0.9),
  preset('door.steel.single', 'Steel door', 'hinged', 1, 'solid', 'painted-steel', 0.9),
  preset('door.fire.single', 'Fire door', 'hinged', 1, 'solid', 'fire-red', 0.9, { fire: true }),
  preset('door.glass.single', 'Glass door', 'hinged', 1, 'glass', 'aluminium', 0.9),
  preset('door.wood.double', 'Double wood door', 'hinged', 2, 'solid', 'wood', 1.8),
  preset('door.glass.double', 'Double glass door', 'hinged', 2, 'glass', 'aluminium', 1.8),
  preset('door.glass.sliding', 'Sliding glass door', 'sliding', 1, 'glass', 'aluminium', 1.8),
  preset('door.folding', 'Folding door', 'folding', 1, 'solid', 'wood', 2.4),
  preset('door.rollup', 'Roll-up shutter', 'rolling', 1, 'solid', 'painted-steel', 3.0, { defaultHeight: 2.4 }),
  preset('door.archway', 'Archway', 'none', 1, 'none', null, 1.2),
]

const BY_ID = new Map(DOOR_PRESETS.map(p => [p.id, p]))
export function findDoorPreset(id: string | undefined): DoorPreset | undefined {
  return id === undefined ? undefined : BY_ID.get(id)
}

export interface WindowPreset {
  id: string
  label: string
  type: WindowAppearance
  material: OpeningMaterial | null
  glass: GlassType
  defaultWidth: number
  defaultHeight: number
  defaultSill: number
}

const windowPreset = (id: string, label: string, type: WindowAppearance, material: OpeningMaterial | null, extra: Partial<WindowPreset> = {}): WindowPreset =>
  ({ id, label, type, material, glass: 'clear', defaultWidth: 1.2, defaultHeight: 1.2, defaultSill: 0.9, ...extra })

export const WINDOW_PRESETS: readonly WindowPreset[] = [
  windowPreset('window.fixed', 'Fixed window', 'fixed', 'aluminium'),
  windowPreset('window.two-pane', 'Two-pane window', 'two-pane', 'aluminium'),
  windowPreset('window.sliding', 'Sliding window', 'sliding', 'aluminium', { defaultWidth: 1.5 }),
  windowPreset('window.casement', 'Casement window', 'casement', 'aluminium', { defaultWidth: 0.6 }),
  windowPreset('window.awning', 'Awning window', 'awning', 'aluminium', { defaultHeight: 0.6, defaultSill: 1.2 }),
  windowPreset('window.jalousie', 'Jalousie (louvre)', 'jalousie', 'aluminium', { defaultWidth: 0.6 }),
  windowPreset('window.transom', 'Transom window', 'transom', 'aluminium', { defaultHeight: 0.4, defaultSill: 2.1 }),
  windowPreset('window.vent-block', 'Vent block', 'vent-block', null, { defaultWidth: 0.6, defaultHeight: 0.6, defaultSill: 1.5 }),
  windowPreset('window.open', 'Open window', 'open', null),
]

const WINDOW_BY_ID = new Map(WINDOW_PRESETS.map(p => [p.id, p]))
export function findWindowPreset(id: string | undefined): WindowPreset | undefined {
  return id === undefined ? undefined : WINDOW_BY_ID.get(id)
}
