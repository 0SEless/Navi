import type { StructureMaterial, StructurePreset } from './types'

/** The built-in material library (shipped with the app; uploads are a later sub-project). */
export const BUILT_IN_MATERIALS: Record<string, StructureMaterial> = Object.fromEntries(
  ([
    ['concrete', 'Concrete', '#c9c4ba'],
    ['concrete-dark', 'Dark concrete', '#a9a397'],
    ['concrete-side', 'Concrete side', '#9d978b'],
    ['concrete-under', 'Concrete underside', '#8c867a'],
    ['painted-green', 'Painted green', '#2f6b3a'],
    ['painted-black', 'Painted black', '#1f2937'],
    ['wood', 'Wood', '#a16207'],
    ['tile-red', 'Red tile', '#b45309'],
    ['brick', 'Brick', '#9a3412'],
    ['steel', 'Steel', '#94a3b8'],
  ] as const).map(([id, name, color]) => [id, { id, name, color }]),
)

/** The starter presets. Admins can save their own. */
export const BUILT_IN_PRESETS: StructurePreset[] = [
  {
    id: 'plain-stair', name: 'Plain stair', form: 'stairs',
    shape: { width: 1.5, underneath: 'open', railings: 'both' },
    look: { tread: 'concrete', side: 'concrete-side', under: 'concrete-under', railing: 'painted-green', railingStyle: 'posts-rails' },
  },
  {
    id: 'hillside-stair', name: 'Hillside stair', form: 'stairs',
    shape: { width: 4.5, underneath: 'solid', railings: 'both' },
    look: { tread: 'concrete', side: 'concrete-dark', under: 'concrete-under', railing: 'painted-green', railingStyle: 'bars' },
  },
  {
    id: 'open-steel-stair', name: 'Open steel stair', form: 'stairs',
    shape: { width: 1.2, underneath: 'open', railings: 'both' },
    look: { tread: 'steel', side: 'steel', under: 'steel', railing: 'painted-black', railingStyle: 'posts-rails' },
  },
  {
    id: 'plain-ramp', name: 'Plain ramp', form: 'ramp',
    shape: { width: 1.5, underneath: 'solid', railings: 'both' },
    look: { tread: 'concrete', side: 'concrete-side', under: 'concrete-under', railing: 'painted-green', railingStyle: 'posts-rails' },
  },
]
