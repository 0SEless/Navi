import { buildStairAssetVolumes, type StairAssetInput } from '../geometry/stair-assets'
import { BUILT_IN_MATERIALS, BUILT_IN_PRESETS } from './materials'
import { buildStructureMesh } from './mesh'
import { structurePath } from './path'

type XY = { x: number; y: number }
type Ring = number[][]

/** No real flight or landing is longer than this, metres. */
const MAX_FLIGHT_M = 60
const PLAIN_STAIR = BUILT_IN_PRESETS.find((p) => p.id === 'plain-stair') ?? BUILT_IN_PRESETS[0]
const mid = (a: number[], b: number[]): XY => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 })
const dist = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1])

/**
 * Smooth floor stairs (owner 2026-11-16: "didn't we already have a smooth stair in the terrain editor?"): each floor
 * stair (Straight or U-Shape) drawn with the terrain editor's stair mesh — treads, sloped solid sides or smooth rails,
 * level landings and the top platform — instead of flat-topped blocks. The flight layout comes from the same builder
 * as the 2.5D blocks (buildStairAssetVolumes), so mesh and blocks always line up; the blocks stay as click targets.
 *
 * `place` turns building-local metres into the mesh layer's metres (east/north around its origin); heights are
 * absolute metres, standing on `base` (the floor's height). Interleaved 9 floats per vertex (position, normal, colour).
 */
export function floorStairMesh(inputs: readonly StairAssetInput[], base: number, place: (p: XY) => XY): Float32Array {
  const parts: Float32Array[] = []
  for (const input of inputs) {
    const props = input.drawing?.properties
    const sides = props?.sides ?? 'open'
    const plain = props ? { ...input, drawing: { ...input.drawing!, properties: { ...props, sides: 'open' as const } } } : input
    const solids = buildStairAssetVolumes([plain], 0).collection.features
    const steps = solids.filter((f) => f.properties?.partType === 'step')
    if (steps.length === 0) continue
    const look = { ...PLAIN_STAIR.look, railingStyle: sides === 'wall' ? 'wall' as const : 'posts-rails' as const }
    const railings = sides === 'open' ? 'none' as const : 'both' as const
    const n1 = props?.preset === 'ushape' ? Math.ceil(steps.length / 2) : steps.length
    const flights = [steps.slice(0, n1), steps.slice(n1)].filter((f) => f.length > 0)
    for (const flight of flights) {
      const first = flight[0].geometry.coordinates[0] as Ring
      const last = flight[flight.length - 1].geometry.coordinates[0] as Ring
      const h0 = Number(flight[0].properties!.height), hN = Number(flight[flight.length - 1].properties!.height)
      const riser = flight.length > 1 ? (hN - h0) / (flight.length - 1) : h0
      const startH = base + h0 - riser, endH = base + hN
      const a = place(mid(first[0], first[1])), b = place(mid(last[3], last[2]))
      // A flight longer than any real stair (or not finite) means a bad map conversion: draw nothing for it.
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) > MAX_FLIGHT_M) continue
      parts.push(buildStructureMesh({
        path: structurePath({ ...a, h: startH } as never, { ...b, h: endH } as never), startH, endH, form: 'stairs', width: dist(first[0], first[1]),
        underneath: 'solid', railings, groundAt: () => base, look, materials: BUILT_IN_MATERIALS,
      }))
    }
    // Level landings (the U-turn half-landing) and the top platform, as flat decks at their height.
    for (const flat of solids.filter((f) => f.properties?.partType === 'landing' || f.properties?.partType === 'top-landing')) {
      const ring = flat.geometry.coordinates[0] as Ring
      const h = base + Number(flat.properties!.height)
      const a = place(mid(ring[0], ring[1])), b = place(mid(ring[3], ring[2]))
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) > MAX_FLIGHT_M) continue
      parts.push(buildStructureMesh({
        path: structurePath({ ...a, h } as never, { ...b, h } as never), startH: h, endH: h, form: 'ramp', width: dist(ring[0], ring[1]),
        underneath: 'solid', railings: flat.properties?.partType === 'top-landing' ? railings : 'none', groundAt: () => base, look, materials: BUILT_IN_MATERIALS,
      }))
    }
  }
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}
