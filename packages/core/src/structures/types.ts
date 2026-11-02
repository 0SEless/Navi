/** Outdoor structures: visual only. Routes are drawn over them with the route tools. */
export type StructureForm = 'stairs' | 'ramp'

/** Where one end of a structure is attached. */
export type StructureEnd =
  /** On a floor slab edge: edge `edgeIndex` of the building outline, `edgeT` 0..1 along it. */
  | { kind: 'slab'; buildingId: string; floorId: string; edgeIndex: number; edgeT: number }
  | { kind: 'road'; roadId: string; position: { lat: number; lng: number } }
  | { kind: 'ground'; position: { lat: number; lng: number } }

export interface Structure {
  id: string
  form: StructureForm
  presetId: string
  start: StructureEnd
  end: StructureEnd
  /** Quadratic Bézier control point; absent = straight. */
  bend?: { lat: number; lng: number }
  width: number
  underneath: 'open' | 'solid'
  railings: 'none' | 'left' | 'right' | 'both'
  /** Stairs: fraction of the run where the flight starts and ends; absent = centred. */
  flight?: { startT: number; endT: number }
  /** Ramps: fractions of the run where a 1.5 m level landing is centred. */
  landings?: number[]
  /** Metres; absent = from the attachment. */
  heightOverride?: { start?: number; end?: number }
}

export interface StructureMaterial {
  id: string
  name: string
  color: string
}

export interface StructurePreset {
  id: string
  name: string
  form: StructureForm
  shape: Pick<Structure, 'width' | 'underneath' | 'railings'>
  /** Material ids per part, and the railing style. */
  look: {
    tread: string
    side: string
    under: string
    railing: string
    railingStyle: 'posts-rails' | 'bars' | 'glass' | 'wall'
  }
}
