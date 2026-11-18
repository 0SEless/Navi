import { buildStairAssetVolumes, buildStairTopVolumes, stairLandingExitEdge, type StairAssetInput, type StairTopInput } from '../geometry/stair-assets'
import { BUILT_IN_MATERIALS, BUILT_IN_PRESETS } from './materials'
import { buildRailingMesh, buildStructureMesh, type RailingStyle } from './mesh'
import { structurePath } from './path'

type XY = { x: number; y: number }
type Ring = number[][]

/** Height of the ground landing in front of an outside stair's first step, metres (a low pad). */
const FOOT_LANDING_M = 0.05
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
export function floorStairMesh(inputs: readonly StairAssetInput[], base: number, place: (p: XY) => XY, ground = base, tops: readonly StairTopInput[] = []): Float32Array {
  const parts: Float32Array[] = []
  for (const input of inputs) {
    const props = input.drawing?.properties
    const sides = props?.sides ?? 'open'
    const plain = props ? { ...input, drawing: { ...input.drawing!, properties: { ...props, sides: 'open' as const } } } : input
    const solids = buildStairAssetVolumes([plain], 0).collection.features
    const steps = solids.filter((f) => f.properties?.partType === 'step')
    if (steps.length === 0) continue
    // Railings chosen per stair (owner 2026-11-17: which side, which style); older stairs keep their Sides look.
    // A Stair-tool stair (no design) has its own look, and by default a half wall with a rail on both sides.
    const chosen = (props ?? input.look) as { railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: 'posts-rails' | 'bars' | 'glass' | 'wall' | 'half-wall'; underneath?: 'open' | 'solid' } | undefined
    const style = chosen?.railingStyle ?? (props ? (sides === 'wall' ? 'wall' : 'posts-rails') : 'half-wall')
    const look = { ...PLAIN_STAIR.look, railingStyle: style }
    const railings = chosen?.railings ?? (props ? (sides === 'open' ? 'none' as const : 'both' as const) : 'both' as const)
    const sideChosen = chosen?.railings !== undefined || !props
    const underneath = chosen?.underneath ?? 'solid'
    // An outside stair (2026-11-17: "the stair is still hollow") is filled down to the ground, not just to its floor.
    const floorAt = input.outside ? Math.min(ground, base) : base
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
      // The terrain editor's shape controls (owner 2026-11-17): Underneath for every stair; Landings, their length and
      // Steepness for a Straight stair (a U-Shape has its own half-landing).
      const shape = props as typeof props & { underneath?: 'open' | 'solid'; landings?: number[]; landingLengthM?: number; landingHeightsM?: Array<number | null>; steepness?: 'gentle' | 'normal' | 'steep' }
      const straight = props?.preset !== 'ushape'
      parts.push(buildStructureMesh({
        path: structurePath({ ...a, h: startH } as never, { ...b, h: endH } as never), startH, endH, form: 'stairs', width: dist(first[0], first[1]),
        underneath, railings, groundAt: () => floorAt, look, materials: BUILT_IN_MATERIALS,
        ...(straight && shape?.landings?.length ? { landings: shape.landings.filter((t) => t > 0 && t < 1) } : {}),
        ...(straight && shape?.landingLengthM !== undefined ? { landingLengthM: shape.landingLengthM } : {}),
        // Landing heights are stored above the stair's own floor; the builder wants absolute heights.
        ...(straight && shape?.landings?.length && shape.landingHeightsM?.some((h) => Number.isFinite(h)) ? { landingHeightsM: shape.landingHeightsM.map((h) => (Number.isFinite(h) ? base + (h as number) : null)) } : {}),
        ...(straight && shape?.steepness ? { steepness: shape.steepness } : {}),
      }))
    }
    // Level landings (the U-turn half-landing) and the top platform, as flat decks at their height. An outside
    // stair's top platform is open on its doorway's side (you walk off it into the doorway; owner 2026-11-17).
    for (const flat of solids.filter((f) => f.properties?.partType === 'landing' || f.properties?.partType === 'top-landing')) {
      const ring = flat.geometry.coordinates[0] as Ring
      const h = base + Number(flat.properties!.height)
      const la = mid(ring[0], ring[1]), lb = mid(ring[3], ring[2])
      const a = place(la), b = place(lb)
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) > MAX_FLIGHT_M) continue
      let deckRails: 'none' | 'left' | 'right' | 'both' = flat.properties?.partType === 'top-landing' && !input.arrivalLanding ? railings : 'none'
      if (!sideChosen && deckRails === 'both' && flat.properties?.partType === 'top-landing' && input.doorwayAt) {
        // Building-local and map metres keep the same handedness, so the side test can use building-local points.
        const cross = (lb.x - la.x) * (input.doorwayAt.y - la.y) - (lb.y - la.y) * (input.doorwayAt.x - la.x)
        deckRails = cross > 0 ? 'right' : 'left'
      }
      parts.push(buildStructureMesh({
        path: structurePath({ ...a, h } as never, { ...b, h } as never), startH: h, endH: h, form: 'ramp', width: dist(ring[0], ring[1]),
        underneath: 'solid', railings: deckRails, groundAt: () => floorAt, look, materials: BUILT_IN_MATERIALS,
      }))
      // Landings and top platforms of a solid stair stand on a closed block down to its floor, inside or outside
      // (owner 2026-11-17: "the stair has hollow" / "why is it not applied in the indoor or even other stairs?").
      const under = underneath
      if (under === 'solid') {
        const corners = ring.slice(0, 4).map((p) => place({ x: p[0], y: p[1] }))
        if (corners.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))) parts.push(solidBlock(corners, floorAt, h, BUILT_IN_MATERIALS[look.side]?.color ?? '#9d978b'))
      }
      // The turn platform (owner 2026-11-17 sketch): a railing on every edge no flight joins, in the Platform railing
      // style (default: the stair's own railing style; none when the stair has no railings).
      if (flat.properties?.partType === 'landing') {
        const picked = (props as { platformRailingStyle?: PlatformRailingStyle } | undefined)?.platformRailingStyle
        const platformStyle = picked && picked !== 'same' ? picked : railings === 'none' ? 'none' : style
        if (platformStyle !== 'none') {
          const corners = ring.slice(0, 4)
          const cx = corners.reduce((n, p) => n + p[0], 0) / 4, cy = corners.reduce((n, p) => n + p[1], 0) / 4
          for (let i = 0; i < 4; i++) {
            const e0 = corners[i], e1 = corners[(i + 1) % 4]
            if (edgeJoinsSteps(e0, e1, steps.map((f) => f.geometry.coordinates[0] as Ring))) continue
            const from = place({ x: e0[0], y: e0[1] }), to = place({ x: e1[0], y: e1[1] }), centre = place({ x: cx, y: cy })
            const m = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
            if (![from.x, from.y, to.x, to.y, centre.x, centre.y].every(Number.isFinite)) continue
            parts.push(buildRailingMesh({ from, to, inward: { x: centre.x - m.x, y: centre.y - m.y }, h, style: platformStyle, look, materials: BUILT_IN_MATERIALS }))
          }
        }
      }
    }
    // An outside stair stands on the ground: a landing in front of its first step, to walk up to it from the path.
    if (input.doorwayAt && input.groundLanding !== false && base <= ground + 1e-6) {
      const first = steps[0].geometry.coordinates[0] as Ring
      const lo = mid(first[0], first[1]), up = mid(first[3], first[2])
      const len = Math.hypot(up.x - lo.x, up.y - lo.y) || 1
      const width = dist(first[0], first[1])
      const out = { x: lo.x - (up.x - lo.x) / len * width, y: lo.y - (up.y - lo.y) / len * width }
      const a = place(out), b = place(lo), h = base + FOOT_LANDING_M
      if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) {
        parts.push(buildStructureMesh({
          path: structurePath({ ...a, h } as never, { ...b, h } as never), startH: h, endH: h, form: 'ramp', width,
          underneath: 'solid', railings: 'none', groundAt: () => base, look, materials: BUILT_IN_MATERIALS,
        }))
      }
    }
  }
  for (const top of tops) {
    const landing = buildStairTopVolumes([top], base).landings.features[0]
    if (!landing) continue
    const ring = landing.geometry.coordinates[0].slice(0, 4)
    const facing = place(mid(ring[0], ring[2]))
    const exit = top.landingExit ? stairLandingExitEdge(ring, top.landingExit) : undefined
    const style = top.drawing?.properties.railingStyle ?? top.look?.railingStyle
      ?? (top.drawing?.properties.sides === 'wall' ? 'wall' : 'half-wall')
    const look = { ...PLAIN_STAIR.look, railingStyle: style }
    for (const edge of [1, 2, 3]) {
      if (edge === exit) continue
      const [x, y] = ring[edge], [endX, endY] = ring[(edge + 1) % 4]
      const from = place({ x, y }), to = place({ x: endX, y: endY })
      if (![from.x, from.y, to.x, to.y, facing.x, facing.y].every(Number.isFinite)) continue
      parts.push(buildRailingMesh({ from, to, inward: { x: facing.x - (from.x + to.x) / 2, y: facing.y - (from.y + to.y) / 2 },
        h: base, style, look, materials: BUILT_IN_MATERIALS }))
    }
  }
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

type PlatformRailingStyle = 'same' | 'none' | RailingStyle

/** Does a flight join this platform edge? (any of five points along it touches a step, within 5 cm) */
function edgeJoinsSteps(a: number[], b: number[], steps: Ring[]): boolean {
  const near = (p: number[], ring: Ring) => {
    let best = Infinity
    for (let i = 0; i < ring.length - 1; i++) {
      const s = ring[i], e = ring[i + 1], dx = e[0] - s[0], dy = e[1] - s[1], len = dx * dx + dy * dy
      const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / len)) : 0
      best = Math.min(best, Math.hypot(p[0] - (s[0] + t * dx), p[1] - (s[1] + t * dy)))
    }
    return best < 0.05
  }
  return [0.15, 0.3, 0.5, 0.7, 0.85].some((t) => {
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    return steps.some((ring) => near(p, ring))
  })
}

/** A closed block (four sides and a top) on a quad footprint, from `low` to `high` metres; 9 floats per vertex. */
function solidBlock(quad: XY[], low: number, high: number, hex: string): Float32Array {
  const c = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '9d978b'
  const rgb = [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255]
  const out: number[] = []
  const tri = (p: number[][], n: number[]) => { for (const v of p) out.push(v[0], v[1], v[2], n[0], n[1], n[2], rgb[0], rgb[1], rgb[2]) }
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length, cy = quad.reduce((s, p) => s + p.y, 0) / quad.length
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i], b = quad[(i + 1) % quad.length]
    let nx = b.y - a.y, ny = -(b.x - a.x)
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    // Face outward (away from the block's middle).
    if (((a.x + b.x) / 2 - cx) * nx + ((a.y + b.y) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny }
    const n = [nx, ny, 0]
    tri([[a.x, a.y, low], [b.x, b.y, low], [b.x, b.y, high]], n)
    tri([[a.x, a.y, low], [b.x, b.y, high], [a.x, a.y, high]], n)
  }
  const [p0, p1, p2, p3] = quad
  tri([[p0.x, p0.y, high], [p1.x, p1.y, high], [p2.x, p2.y, high]], [0, 0, 1])
  tri([[p0.x, p0.y, high], [p2.x, p2.y, high], [p3.x, p3.y, high]], [0, 0, 1])
  return new Float32Array(out)
}
