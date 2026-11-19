import type { LocalCoord, LocalPolygon } from '../types/coordinates'
import type { StairLevelGeometry } from '../types/entities'
import { stairShape } from '../structures/stair-shape'
import { resolveStairDirectionCorners } from './stair-direction'

export interface StairAssetInput {
  id: string
  position: LocalCoord
  /** Canonical per-level rotation, in degrees. */
  rotation: number
  polygon?: LocalPolygon
  drawing?: StairLevelGeometry['drawing']
  landing?: StairLevelGeometry['landing']
  /** Known floor-to-floor rise in meters. */
  height?: number
  /**
   * Outside stair (2026-11-17): the middle of the doorway its top platform opens into (building-local). The smooth
   * mesh leaves that side of the platform open and adds a ground landing at the stair's foot.
   */
  doorwayAt?: LocalCoord
  /** False for an upper-floor flight already served by a floor platform. */
  groundLanding?: boolean
  landingExit?: StairLevelGeometry['landingExit']
  landingExitSpan?: StairLevelGeometry['landingExitSpan']
  arrivalLanding?: boolean
  /** A Stair-tool stair's railings and underneath (2026-11-17). */
  look?: StairLevelGeometry['look']
  /** Outside the building's walls (2026-11-17): a solid stair is filled down to the ground, not just its floor. */
  outside?: boolean
  /** Entry platform at the foot of a stair that starts outside its floor (owner 2026-11-19); see stairEntryPlatform. */
  entryPlatform?: { ring: LocalCoord[]; railed: boolean[] }
}
/** Landing entry is edge 0, front is edge 2, and sides are relative to the final flight. */
export function stairLandingExitEdge(ring: readonly number[][], side: NonNullable<StairAssetInput['landingExit']>): number {
  if (side === 'front') return 2
  const [a, b, c, d] = ring
  const dx = c[0] + d[0] - a[0] - b[0]
  const dy = c[1] + d[1] - a[1] - b[1]
  const edgeOneIsLeft = dx * (b[1] - a[1]) - dy * (b[0] - a[0]) > 0
  return (side === 'left') === edgeOneIsLeft ? 1 : 3
}

/** Keep the portions of each landing edge outside the resolved walking opening. Edge 0 joins the flight. */
export function stairLandingGuardSegments(ring: readonly number[][], input: Pick<StairAssetInput, 'landingExit' | 'landingExitSpan'>) {
  const exit = input.landingExit ? stairLandingExitEdge(ring, input.landingExit) : undefined
  const span = input.landingExitSpan ?? [0, 1] // historical confirmed exits stored the whole open edge
  const validSpan = span[0] >= 0 && span[1] <= 1 && span[0] < span[1]
  return [1, 2, 3].flatMap(edge => {
    const a = ring[edge], b = ring[(edge + 1) % 4]
    const at = (t: number) => ({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t })
    return (edge === exit && validSpan ? [[0, span[0]], [span[1], 1]] : [[0, 1]]).flatMap(([start, end], index) =>
      end - start > 1e-6 ? [{ edge, index, from: at(start), to: at(end) }] : [])
  })
}

export interface StairAssetDiagnostic { entityId: string; code: string; message: string }
export interface StairAssetVolumes {
  collection: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  diagnostics: StairAssetDiagnostic[]
}
type Point = [number, number]

function ringPoints(polygon: LocalPolygon): Point[] | undefined {
  if (!Array.isArray(polygon.points) || polygon.points.length < 4 || polygon.points.length > 257) return
  const points: Point[] = polygon.points.map(p => [p?.x, p?.y])
  if (!points.flat().every(Number.isFinite)) return
  const first = points[0], last = points[points.length - 1]
  // Local polygons from canonical floor geometry may omit the closing vertex.
  // Copy either representation; generated GeoJSON alone receives a closing point.
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points
}

function positiveArea(points: Point[]): boolean {
  if (points.length < 3) return false
  const [ox, oy] = points[0]
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    area += (a[0] - ox) * (b[1] - oy) - (b[0] - ox) * (a[1] - oy)
  }
  return Number.isFinite(area) && Math.abs(area) > 0
}

/** Decorative solids only. Unknown rise/topology keeps the caller's marker fallback.
 * Straight parametric footprints follow canonical center anchoring and degree rotation.
 * Turning presets currently lack an authored flight path, so they are never straightened.
 */
export function buildStairAssetVolumes(inputs: readonly StairAssetInput[], base = 0): StairAssetVolumes {
  const result: StairAssetVolumes = { collection: { type: 'FeatureCollection', features: [] }, diagnostics: [] }
  for (const input of inputs) {
    const diagnostic = (code: string, message: string) => result.diagnostics.push({ entityId: input.id, code, message })
    const rise = input.height
    if (![base, input.position?.x, input.position?.y, input.rotation, rise].every(Number.isFinite)
      || rise === undefined || rise <= 0 || !Number.isFinite(base + rise) || base + rise <= base) {
      diagnostic('invalid-dimensions', 'Stair requires a finite position, rotation, datum and positive known floor rise.')
      continue
    }
    const drawing = input.drawing?.properties
    if (drawing && (input.drawing?.definitionId !== 'stair' || (drawing.preset !== 'straight' && drawing.preset !== 'ushape'))) {
      diagnostic('unsupported-preset', 'This stair preset has no resolved flight path; retain its fallback marker.')
      continue
    }
    if (drawing && (!Number.isInteger(drawing.stepCount) || drawing.stepCount < 1 || drawing.stepCount > 128
      || ![drawing.stepWidth, drawing.stepDepth].every(n => Number.isFinite(n) && n > 0))) {
      diagnostic('invalid-dimensions', 'Authored stair count must be 1–128 with finite positive tread dimensions.')
      continue
    }
    const angle = (input.rotation % 360) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const toLocal = ([x, y]: Point): Point => {
      const dx = x - input.position.x, dy = y - input.position.y
      return [dx * cos + dy * sin, -dx * sin + dy * cos]
    }
    const toWorld = ([x, y]: Point): Point => [input.position.x + x * cos - y * sin, input.position.y + x * sin + y * cos]
    if (drawing?.preset === 'ushape') {
      const layout = uShapeLayout(drawing, rise)
      if (!layout) {
        diagnostic('invalid-dimensions', 'A U-Shape stair needs at least 2 steps and a known direction.')
        continue
      }
      result.collection.features.push(...stairPieces(input.id, layout, drawing, base, toWorld))
      continue
    }
    let points: Point[] | undefined
    if (input.polygon) points = ringPoints(input.polygon)?.map(toLocal)
    else if (drawing) {
      const hw = drawing.stepWidth / 2, hd = drawing.stepDepth * drawing.stepCount / 2
      points = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    }
    if (!points || points.length !== 4 || !points.flat().every(Number.isFinite) || !positiveArea(points)) {
      diagnostic('missing-footprint', 'Stair requires a resolved rectangular footprint or valid parametric dimensions.')
      continue
    }
    // A stair drawn with the Stair tool (no authored design) on a turned building has an outline that is turned
    // against its saved rotation (owner 2026-11-17: ASU stairs stayed flat). Its steps come straight from the
    // outline, so check that outline is a rectangle along its own edges, to the nearest millimetre per metre.
    const along = drawing ? 0 : Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0])
    const checked: Point[] = drawing ? points : points.map(([x, y]) => [x * Math.cos(along) + y * Math.sin(along), -x * Math.sin(along) + y * Math.cos(along)])
    const xmin = Math.min(...checked.map(p => p[0])), xmax = Math.max(...checked.map(p => p[0]))
    const ymin = Math.min(...checked.map(p => p[1])), ymax = Math.max(...checked.map(p => p[1]))
    const width = xmax - xmin, depth = ymax - ymin
    const epsilon = Math.max(width, depth) * (drawing ? 1e-8 : 1e-3)
    const corner = (p: Point) => `${Math.abs(p[0] - xmin) <= epsilon ? 0 : Math.abs(p[0] - xmax) <= epsilon ? 1 : 2}:${Math.abs(p[1] - ymin) <= epsilon ? 0 : Math.abs(p[1] - ymax) <= epsilon ? 1 : 2}`
    const corners = checked.map(corner)
    if (!(width > 0 && depth > 0) || ![width, depth].every(Number.isFinite) || corners.some(c => c.includes('2')) || new Set(corners).size !== 4) {
      diagnostic('unsupported-footprint', 'Nonrectangular stairs need an authored flight path; retain their fallback marker.')
      continue
    }
    // With no authored treads, the explicit rectangle and rise permit illustrative
    // steps only. This never creates drawing data or changes the source document.
    const count = drawing?.stepCount ?? Math.max(2, Math.min(128, Math.ceil(rise / 0.18)))
    const cornerOrder = resolveStairDirectionCorners(drawing?.direction)
    if (!cornerOrder) {
      diagnostic('unsupported-direction', 'Stair direction is unknown; retain its fallback marker.')
      continue
    }
    // Authored cardinal directions use canonical local axes. Freeform stairs
    // retain the exact ordered edge-to-edge flight shown by their 2D arrow.
    const footprint: Point[] = drawing
      ? [[xmax, ymax], [xmin, ymax], [xmin, ymin], [xmax, ymin]]
      : points
    const [p0, p1, p2, p3] = cornerOrder.map(index => footprint[index])
    const interpolate = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
    for (let i = 0; i < count; i++) {
      const a = i / count, b = (i + 1) / count
      const ring = [interpolate(p0, p3, a), interpolate(p1, p2, a), interpolate(p1, p2, b), interpolate(p0, p3, b)].map(toWorld)
      const height = base + rise * ((i + 1) / count)
      if (!ring.flat().every(Number.isFinite) || !positiveArea(ring) || !(height > base)) break
      const id = `${input.id}:step:${i}`
      features.push({ type: 'Feature', id, properties: { id, featureId: input.id, partType: 'step', base, height }, geometry: { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] } })
    }
    if (features.length !== count) {
      diagnostic('collapsed-geometry', 'Stair dimensions collapse at this datum; retain its fallback marker.')
      continue
    }
    result.collection.features.push(...features)
    // Sides and a top landing (2026-11-16) only when authored, so existing straight stairs are unchanged.
    if (drawing && ((drawing.sides && drawing.sides !== 'open') || drawing.topLandingM !== undefined)) {
      const flight: Flight = { q: [p0, p1, p2, p3], count, h0: 0, dh: rise / count, sides: [[0, SIDE_T / Math.hypot(p1[0] - p0[0], p1[1] - p0[1])], [1 - SIDE_T / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 1]] }
      const top = drawing.topLandingM !== undefined ? topLandingQuad(flight.q, drawing.topLandingM) : undefined
      result.collection.features.push(...stairPieces(input.id, { flights: [flight], landings: [], ...(top ? { top: { q: top, h: rise } } : {}) }, drawing, base, toWorld, false))
    }
    if (!drawing) diagnostic('STAIR_APPROXIMATE', 'Illustrative treads use the resolved rectangular footprint and known rise; no authored tread count exists.')
    if (input.landing) {
      const ring = input.landing.polygon && ringPoints(input.landing.polygon)
      const height = base + Math.min(0.15, rise / count)
      if (!ring || !positiveArea(ring) || !(height > base)) {
        diagnostic('missing-landing-polygon', 'Landing has no finite positive polygon; retain its landing marker.')
      } else {
        const id = `${input.id}:landing`
        result.collection.features.push({ type: 'Feature', id, properties: { id, featureId: input.id, partType: 'landing', base, height }, geometry: { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] } })
      }
    }
  }
  return result
}

// ── Stair shapes and sides (2026-11-16, whole-building view and floor-to-floor stairs) ──────────────────────────
type Quad = [Point, Point, Point, Point]
/** A flight: low edge p0→p1, high edge p3→p2 (p3 above p0); lateral u = 0 at p0's side, 1 at p1's side. */
export interface Flight { q: Quad; count: number; h0: number; dh: number; sides: Array<[number, number]> }
export interface StairLayout {
  flights: Flight[]
  /** Level landings: quad, height, and lateral/along ranges for sides. */
  landings: Array<{ q: Quad; h: number; sides: Array<{ u: [number, number]; a: [number, number] }> }>
  top?: { q: Quad; h: number }
}
/** Thickness of a parapet or rail, metres. */
const SIDE_T = 0.12
/** Gap between the two flights of a U-Shape stair, metres (spec). */
export const U_STAIR_GAP = 0.2
const PARAPET_M = 1.0
const RAIL_BASE_M = 0.9
const RAIL_TOP_M = 0.95

const lerpP = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const at = (q: Quad, u: number, a: number): Point => lerpP(lerpP(q[0], q[3], a), lerpP(q[1], q[2], a), u)
const band = (q: Quad, u0: number, u1: number, a0: number, a1: number): Point[] => [at(q, u0, a0), at(q, u1, a0), at(q, u1, a1), at(q, u0, a1)]

const FORWARD: Record<string, Point> = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }

/** The level platform after a flight's high edge, `length` metres long in the climbing direction. */
export function topLandingQuad(q: Quad, length: number): Quad {
  const dx = q[3][0] - q[0][0], dy = q[3][1] - q[0][1], n = Math.hypot(dx, dy) || 1
  const d: Point = [dx / n * length, dy / n * length]
  return [q[3], q[2], [q[2][0] + d[0], q[2][1] + d[1]], [q[3][0] + d[0], q[3][1] + d[1]]]
}

/**
 * U-Shape (switchback) layout in the stair's local frame, centred on its position: flight 1 climbs along
 * `direction` with ceil(n/2) steps, a half-landing as deep as a flight is wide spans both flights, flight 2 climbs
 * back on the `turn` side (right by default) to the full rise; flights are `U_STAIR_GAP` apart.
 */
export function uShapeLayout(props: { stepCount: number; stepWidth: number; stepDepth: number; direction: string; turn?: 'left' | 'right'; topLandingM?: number }, rise: number): StairLayout | undefined {
  const F = FORWARD[props.direction]
  const n = props.stepCount
  if (!F || !Number.isInteger(n) || n < 2) return undefined
  const S: Point = [-F[1], F[0]]
  const P = (along: number, lat: number): Point => [F[0] * along + S[0] * lat, F[1] * along + S[1] * lat]
  const w = props.stepWidth, d = props.stepDepth, g = U_STAIR_GAP
  const n1 = Math.ceil(n / 2), n2 = n - n1, r = rise / n
  const W = 2 * w + g, D = n1 * d + w
  const sgn = props.turn === 'left' ? -1 : 1
  const o1 = -sgn * W / 2, i1 = -sgn * (W / 2 - w), o2 = sgn * W / 2, i2 = sgn * (W / 2 - w)
  const aE = -D / 2 + n1 * d
  // u = 0 is the outer side; the middle wall sits in the inner half of the gap (u from 1 to 1 + g/2/w).
  const t = SIDE_T / w, mid: [number, number] = [1, 1 + g / 2 / w]
  const f1: Flight = { q: [P(-D / 2, o1), P(-D / 2, i1), P(aE, i1), P(aE, o1)], count: n1, h0: 0, dh: r, sides: [[0, t], mid] }
  const f2: Flight = { q: [P(aE, o2), P(aE, i2), P(aE - n2 * d, i2), P(aE - n2 * d, o2)], count: n2, h0: n1 * r, dh: r, sides: [[0, t], mid] }
  const landing: Quad = [P(aE, -W / 2), P(aE, W / 2), P(D / 2, W / 2), P(D / 2, -W / 2)]
  const tl = SIDE_T / W, ta = SIDE_T / w
  return {
    flights: [f1, f2],
    landings: [{ q: landing, h: n1 * r, sides: [{ u: [0, tl], a: [0, 1] }, { u: [1 - tl, 1], a: [0, 1] }, { u: [0, 1], a: [1 - ta, 1] }] }],
    top: { q: topLandingQuad(f2.q, props.topLandingM ?? w), h: rise },
  }
}

/** Riser height used to count the steps of a drawn stair made U-Shape, metres (as its illustrative straight steps). */
const BOX_U_RISER_M = 0.18
/** Narrowest flight a U-Shape made from a drawn box may have, metres. */
export const BOX_U_MIN_FLIGHT_M = 0.5

/**
 * Owner 2026-11-19 (ASU Tourism): a stair drawn as a box with the Stair tool (its first edge is the bottom step) made
 * U-Shape in the SAME box — two flights side by side, the turning landing at the far end, arriving back beside the
 * foot. Returns the designed stair that does this (centred on the box, climbing "north" turned onto the box), keeping
 * the box in `fromBox` so Straight can bring it back. Undefined when the box is too narrow or short for it.
 */
export function boxStairAsUShape(flight: { position: { x: number; y: number }; rotation?: number; polygon?: { points: Array<{ x: number; y: number }> }; look?: { railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: 'posts-rails' | 'bars' | 'glass' | 'wall' | 'half-wall'; underneath?: 'open' | 'solid'; entryRailing?: 'railing' | 'flat'; exitRailing?: 'railing' | 'flat' } }, rise: number, turn: 'left' | 'right' = 'right') {
  const ring = flight.polygon && ringPoints(flight.polygon)
  if (!ring || ring.length !== 4 || !(rise > 0)) return undefined
  const [p0, p1, p2, p3] = ring
  const foot: Point = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], far: Point = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), length = Math.hypot(far[0] - foot[0], far[1] - foot[1])
  const flightWidth = (width - U_STAIR_GAP) / 2
  const stepCount = Math.max(2, Math.ceil(rise / BOX_U_RISER_M))
  const stepDepth = (length - flightWidth) / Math.ceil(stepCount / 2)
  if (!(flightWidth >= BOX_U_MIN_FLIGHT_M) || !(stepDepth >= 0.15) || ![width, length].every(Number.isFinite)) return undefined
  // Local "north" is (0, -1); turned by `rotation` degrees it must point from the foot to the far end.
  const rotation = Math.atan2(far[0] - foot[0], -(far[1] - foot[1])) * 180 / Math.PI
  const position = { x: ring.reduce((s, p) => s + p[0], 0) / 4, y: ring.reduce((s, p) => s + p[1], 0) / 4 }
  const look = flight.look ?? {}
  return {
    position, rotation,
    drawing: { definitionId: 'stair' as const, properties: {
      preset: 'ushape', direction: 'north', turn, stepCount, stepWidth: flightWidth, stepDepth,
      ...(look.railings ? { railings: look.railings } : {}), ...(look.railingStyle ? { railingStyle: look.railingStyle } : {}),
      ...(look.underneath ? { underneath: look.underneath } : {}),
      ...(look.entryRailing ? { entryRailing: look.entryRailing } : {}), ...(look.exitRailing ? { exitRailing: look.exitRailing } : {}),
      fromBox: flight.polygon!.points.map((p) => ({ x: p.x, y: p.y })), fromBoxRotation: flight.rotation ?? 0,
    } },
  }
}

/**
 * Owner 2026-11-19: a U-Shape stair dragged by a corner or side in 2D resizes like a straight one — both flights fill
 * the new box. `before` and `after` are its 2D outline (four corners, same order) before and after the drag. Returns
 * the new step width and depth (the step count stays: the rise has not changed) and, for a stair made from a drawn
 * box, that box moved onto the new outline; or an error when the box is too small for two flights.
 */
export function uShapeResizedToBox(
  props: { stepCount?: number; stepWidth?: number; stepDepth?: number; fromBox?: Array<{ x: number; y: number }> },
  before: ReadonlyArray<{ x: number; y: number }>, after: ReadonlyArray<{ x: number; y: number }>,
): { stepWidth: number; stepDepth: number; fromBox?: Array<{ x: number; y: number }> } | { error: string } {
  if (before.length !== 4 || after.length !== 4) return { error: 'A U-Shape stair resizes by its four corners.' }
  const len = (r: ReadonlyArray<{ x: number; y: number }>, i: number) => Math.hypot(r[(i + 1) % 4].x - r[i].x, r[(i + 1) % 4].y - r[i].y)
  const stepWidth = props.stepWidth ?? 1.2, n1 = Math.ceil((props.stepCount ?? 4) / 2)
  const W = 2 * stepWidth + U_STAIR_GAP
  // Which pair of sides is the stair's width (both flights side by side): the one that measured W before.
  const widthEdge = Math.abs(len(before, 0) - W) <= Math.abs(len(before, 1) - W) ? 0 : 1
  const newW = len(after, widthEdge), newD = len(after, 1 - widthEdge)
  const flightWidth = (newW - U_STAIR_GAP) / 2
  const stepDepth = (newD - flightWidth) / n1
  if (![newW, newD].every(Number.isFinite) || !(flightWidth >= BOX_U_MIN_FLIGHT_M)) {
    return { error: `Too narrow for a U-Shape: the box must be at least ${(2 * BOX_U_MIN_FLIGHT_M + U_STAIR_GAP).toFixed(1)} m wide (two flights side by side).` }
  }
  if (!(stepDepth >= 0.15)) return { error: 'Too short for a U-Shape: make the box longer so each step is at least 0.15 m deep.' }
  let fromBox: Array<{ x: number; y: number }> | undefined
  if (props.fromBox?.length === 4) {
    // Each corner of the drawn box sits on a corner of the outline: it moves with that corner.
    fromBox = props.fromBox.map((p) => {
      let best = 0
      for (let i = 1; i < 4; i++) if (Math.hypot(before[i].x - p.x, before[i].y - p.y) < Math.hypot(before[best].x - p.x, before[best].y - p.y)) best = i
      return { x: after[best].x, y: after[best].y }
    })
  }
  return { stepWidth: flightWidth, stepDepth, ...(fromBox ? { fromBox } : {}) }
}

/** Solids for a stair layout: steps (unless `withSteps` is false), landings, top landing and the authored sides. */
function stairPieces(id: string, layout: StairLayout, props: { sides?: 'open' | 'railing' | 'wall' }, base: number, toWorld: (p: Point) => Point, withSteps = true): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const out: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  let k = 0
  const push = (partType: string, ring: Point[], lo: number, hi: number) => {
    const world = ring.map(toWorld)
    if (!world.flat().every(Number.isFinite) || !positiveArea(world) || !(hi > lo)) return
    const fid = `${id}:${partType}:${k++}`
    out.push({ type: 'Feature', id: fid, properties: { id: fid, featureId: id, partType, base: lo, height: hi }, geometry: { type: 'Polygon', coordinates: [[...world, [...world[0]]]] } })
  }
  const side = (ring: Point[], h: number) => {
    if (props.sides === 'wall') push('parapet', ring, base, base + h + PARAPET_M)
    else if (props.sides === 'railing') push('rail', ring, base + h + RAIL_BASE_M, base + h + RAIL_TOP_M)
  }
  for (const f of layout.flights) {
    for (let i = 0; i < f.count; i++) {
      const a0 = i / f.count, a1 = (i + 1) / f.count, h = f.h0 + f.dh * (i + 1)
      if (withSteps) push('step', band(f.q, 0, 1, a0, a1), base, base + h)
      for (const [u0, u1] of f.sides) side(band(f.q, u0, u1, a0, a1), h)
    }
  }
  for (const l of layout.landings) {
    push('landing', band(l.q, 0, 1, 0, 1), base, base + l.h)
    for (const s of l.sides) side(band(l.q, s.u[0], s.u[1], s.a[0], s.a[1]), l.h)
  }
  if (layout.top) {
    push('top-landing', band(layout.top.q, 0, 1, 0, 1), base, base + layout.top.h)
    const w = Math.hypot(layout.top.q[1][0] - layout.top.q[0][0], layout.top.q[1][1] - layout.top.q[0][1]) || 1
    side(band(layout.top.q, 0, SIDE_T / w, 0, 1), layout.top.h)
    side(band(layout.top.q, 1 - SIDE_T / w, 1, 0, 1), layout.top.h)
  }
  return out
}

// ── Stair tops (2026-11-16): what the floor a stair arrives on shows ────────────────────────────────────────────
/** A stair arriving on this floor: the flight's own input (from its From floor) plus that floor. */
export type StairTopInput = StairAssetInput & { fromLevel: number }
/** Thickness of the walkable top landing slab drawn on the upper floor, metres. */
const TOP_SLAB_M = 0.05

/** The flight's footprint rectangle (local, stair-aligned) and where its top landing lies. */
export function stairTopShape(input: StairTopInput): { well: Point[]; landing: Point[]; integrated: boolean } | undefined {
  const plain = input.drawing ? { ...input, drawing: { ...input.drawing, properties: { ...input.drawing.properties, sides: 'open' as const } } } : input
  const solids = buildStairAssetVolumes([plain], 0).collection.features
  const steps = solids.filter(f => f.properties?.partType === 'step')
  if (steps.length === 0) return undefined
  const angle = (input.rotation % 360) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  const toLocal = ([x, y]: number[]): Point => { const dx = x - input.position.x, dy = y - input.position.y; return [dx * cos + dy * sin, -dx * sin + dy * cos] }
  const toWorld = ([x, y]: Point): Point => [input.position.x + x * cos - y * sin, input.position.y + x * sin + y * cos]
  const body = solids.filter(f => f.properties?.partType === 'step' || f.properties?.partType === 'landing')
  const local = body.flatMap(f => f.geometry.coordinates[0].map(toLocal))
  const xs = local.map(p => p[0]), ys = local.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const well = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[]).map(toWorld)
  // The smooth rectangular flight already has a flat area beyond its last riser.
  // Use the same centred flight profile as the mesh instead of adding a second slab.
  const first = steps[0].geometry.coordinates[0] as Point[]
  const last = steps[steps.length - 1].geometry.coordinates[0] as Point[]
  if (!input.drawing && input.look?.topLandingM == null) {
    const run = Math.hypot(last[3][0] - first[0][0], last[3][1] - first[0][1])
    const { flightEndM } = stairShape(input.height ?? 0, run)
    if (run - flightEndM >= 0.5) {
      const t = flightEndM / run
      const landing: Point[] = [lerpP(first[0], last[3], t), lerpP(first[1], last[2], t), last[2], last[3]]
      return { well: [first[0], first[1], landing[1], landing[0]], landing, integrated: true }
    }
  }
  const authored = solids.find(f => f.properties?.partType === 'top-landing')
  let landing: Point[]
  if (authored) landing = authored.geometry.coordinates[0].slice(0, 4) as Point[]
  else {
    // No authored top landing: the arrival area is a platform as long as the flight is wide past its last step.
    const last = steps[steps.length - 1].geometry.coordinates[0].slice(0, 4) as Point[]
    const width = Math.hypot(last[1][0] - last[0][0], last[1][1] - last[0][1])
    const depth = input.look?.topLandingM
    landing = topLandingQuad([last[0], last[1], last[2], last[3]], typeof depth === 'number' && Number.isFinite(depth) && depth >= 0.5 ? depth : width)
  }
  return { well: input.drawing?.properties.preset === 'ushape' ? well : [first[0], first[1], last[2], last[3]], landing, integrated: false }
}

/** Block rendering of the same in-footprint stair profile, used when a smooth mesh cannot be drawn. */
export function integratedStairVolumes(input: StairAssetInput, base: number): GeoJSON.Feature<GeoJSON.Polygon>[] | undefined {
  if (!input.arrivalLanding) return
  const shape = stairTopShape({ ...input, fromLevel: 0 })
  if (!shape?.integrated) return
  const [a, b] = shape.well
  const [, , c, d] = shape.landing
  const run = Math.hypot(d[0] - a[0], d[1] - a[1])
  const profile = stairShape(input.height ?? 0, run)
  if (!(run > 0) || !profile.steps) return
  const quad = (start: number, end: number): number[][] => {
    const first = lerpP(a, d, start / run)
    return [first, lerpP(b, c, start / run), lerpP(b, c, end / run), lerpP(a, d, end / run), first]
  }
  const feature = (partType: string, index: number, ring: number[][], low: number, height: number): GeoJSON.Feature<GeoJSON.Polygon> => ({
    type: 'Feature', id: `${input.id}:${partType}:${index}`,
    properties: { featureId: input.id, partType, base: low, height },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
  const stairs = Array.from({ length: profile.steps }, (_, index) => {
    const start = profile.flightStartM + index * profile.treadM
    const height = base + (index + 1) * profile.riserM
    return feature('step', index, quad(start, start + profile.treadM), input.look?.underneath === 'open' ? height - 0.05 : base, height)
  })
  if (profile.flightStartM > 0.01) stairs.unshift(feature('landing', 0, quad(0, profile.flightStartM), base - 0.05, base))
  const top = base + (input.height ?? 0)
  stairs.push(feature('integrated-arrival', 0, quad(profile.flightEndM, run), top - 0.05, top))
  return stairs
}

/** On the floor a stair arrives on: a dashed stairwell outline (not walkable) and the walkable top landing. */
export function buildStairTopVolumes(tops: readonly StairTopInput[], base: number): { landings: GeoJSON.FeatureCollection<GeoJSON.Polygon>; wells: GeoJSON.FeatureCollection<GeoJSON.Polygon> } {
  const landings: GeoJSON.Feature<GeoJSON.Polygon>[] = [], wells: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (const top of tops) {
    const shape = stairTopShape(top)
    if (!shape) continue
    const close = (ring: Point[]) => [[...ring, [...ring[0]]]]
    wells.push({ type: 'Feature', id: `${top.id}:well`, properties: { id: `${top.id}:well`, featureId: top.id, partType: 'stairwell', fromLevel: top.fromLevel, base, height: base + 0.02 }, geometry: { type: 'Polygon', coordinates: close(shape.well) } })
    if (shape.integrated) continue
    landings.push({ type: 'Feature', id: `${top.id}:top`, properties: { id: `${top.id}:top`, featureId: top.id, partType: 'top-landing', fromLevel: top.fromLevel, base, height: base + TOP_SLAB_M }, geometry: { type: 'Polygon', coordinates: close(shape.landing) } })
  }
  return { landings: { type: 'FeatureCollection', features: landings }, wells: { type: 'FeatureCollection', features: wells } }
}

const insidePolygon = ([x, y]: Point, ring: readonly { x: number; y: number }[]): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Stairwells to cut out of the upper floor: only stairs whose footprint lies inside the building outline. */
export function stairWellHoles(tops: readonly StairTopInput[], outline: readonly { x: number; y: number }[]): LocalPolygon[] {
  if (outline.length < 3) return []
  return tops.flatMap((top) => {
    const shape = stairTopShape(top)
    return shape && shape.well.every(p => insidePolygon(p, outline)) ? [{ points: shape.well.map(([x, y]) => ({ x, y })) } as LocalPolygon] : []
  })
}
