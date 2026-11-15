import type { CampusDocument } from '../types/document'
import type { Building, Road } from '../types/entities'
import type { Structure } from '../structures/types'
import { structurePath } from '../structures/path'
import { stairShape } from '../structures/stair-shape'
import { rampHeightAt } from '../structures/ramp-shape'
import { structureProfile, usesProfile } from '../structures/structure-profile'
import { sampleBaseExtended } from './base-surface'
import { decodeTile, tileIdOf, tileOfCell, toLocal } from './grid'
import type { GroundFit, TerrainGrid, TileId } from './types'
import { isValidMesh, meshFrame, meshValueAt, meshWeightAt, type TerrainMesh } from './mesh'
import { alongOf, junctionShapes, platformProfile, pointAlong, roadGradeProfile, type GradePin } from './road-grade'
import { BANK_REACH_M, WALKWAY_M, groundAroundOf, type GroundAround } from './ground-around'

type Point = { x: number; y: number }

export interface TerrainSampler {
  grid: TerrainGrid
  /** Metres; 0 where there is no base. */
  baseAt(x: number, y: number): number
  /** Metres from the change tiles (bilinear between cells). */
  changeAt(x: number, y: number): number
  /** base + change only (the painted ground, before meshes). */
  sculptedAt(x: number, y: number): number
  /** sculpted ground with the terrain meshes applied (no fits): the ground buildings and roads follow. */
  groundAt(x: number, y: number): number
  /** Metres delta from building pads and road fits. */
  fitAt(x: number, y: number): number
  /** base + change + fit. */
  heightAt(x: number, y: number): number
}

export interface TerrainSamplerOptions {
  /** Working tiles of a stroke in progress; they replace the document's tiles with the same id. */
  tilesOverride?: Map<TileId, Int16Array>
  /** The Mesh tool's live draft: replaces the document's meshes. */
  meshesOverride?: TerrainMesh[]
  /** Studio's view: honour `hidden` meshes and `sculptingHidden`. Publishing and baking never pass it. */
  studioView?: boolean
}

/** Each valid mesh's reach (outline box + 1 m) in the terrain grid's metres. */
export function meshReachBoxes(doc: CampusDocument, grid: TerrainGrid): Box[] {
  return (doc.terrain?.meshes ?? []).filter(isValidMesh).map((mesh) => {
    const { box } = meshFrame(mesh, grid)
    return { minX: box.minX - 1, minY: box.minY - 1, maxX: box.maxX + 1, maxY: box.maxY + 1 }
  })
}

// ── geometry helpers (local metres) ──────────────────────────────────────────

function pointInPolygon(p: Point, ring: Point[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distanceToSegments(p: Point, points: Point[], closed: boolean): number {
  let best = Infinity
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/** 1 at the edge, 0 at `blend` (smoothstep). */
function blendWeight(distance: number, blend: number): number {
  if (blend <= 0) return distance <= 0 ? 1 : 0
  const t = Math.min(Math.max(distance / blend, 0), 1)
  return 1 - t * t * (3 - 2 * t)
}

function fitApplies(mode: GroundFit['mode'], delta: number): boolean {
  return mode === 'both' || (mode === 'raise' && delta > 0) || (mode === 'lower' && delta < 0)
}

function outlineOf(building: Building, grid: TerrainGrid): Point[] {
  const points = building.footprint?.points ?? []
  const ring = points.map((p) => toLocal(grid, p))
  if (ring.length > 1) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first.x === last.x && first.y === last.y) ring.pop()
  }
  return ring
}

/** Mean ground over the building outline at 1 m spacing (vertex mean for outlines smaller than a cell). */
export function followGroundBase(building: Building, groundOnly: (x: number, y: number) => number, grid: TerrainGrid): number {
  const ring = outlineOf(building, grid)
  if (ring.length === 0) return building.baseElevation ?? 0
  const minX = Math.ceil(Math.min(...ring.map((p) => p.x)) - 1e-6)
  const maxX = Math.floor(Math.max(...ring.map((p) => p.x)) + 1e-6)
  const minY = Math.ceil(Math.min(...ring.map((p) => p.y)) - 1e-6)
  const maxY = Math.floor(Math.max(...ring.map((p) => p.y)) + 1e-6)
  let sum = 0
  let count = 0
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const p = { x, y }
      if (pointInPolygon(p, ring) || distanceToSegments(p, ring, true) < 1e-6) {
        sum += groundOnly(x, y)
        count++
      }
    }
  }
  if (count === 0) return ring.reduce((total, p) => total + groundOnly(p.x, p.y), 0) / ring.length
  return sum / count
}

/** Fixed → baseElevation; follow-ground → followGroundBase over base + change (no fits). */
export function effectiveBuildingBase(building: Building, sampler: TerrainSampler, grid: TerrainGrid = sampler.grid): number {
  if (building.ground?.baseMode !== 'follow-ground') return building.baseElevation ?? 0
  return followGroundBase(building, (x, y) => sampler.groundAt(x, y), grid)
}

// ── sampler ──────────────────────────────────────────────────────────────────

interface Box { minX: number; minY: number; maxX: number; maxY: number }

const EASE_M = 5
/** A road without ground-fit settings: Raise and lower, 3 m shoulder (2026-11-15). */
export const DEFAULT_ROAD_FIT: GroundFit = { mode: 'both', blendMeters: 3 }
const ROAD_BANK_SLOPE = 0.5
const ROAD_BANK_REACH_M = 40
function smoothstep01(t: number): number {
  const u = Math.min(Math.max(t, 0), 1)
  return u * u * (3 - 2 * u)
}

interface PadEntry { ring: Point[]; around: GroundAround; slope: number; base: () => number; box: Box }
interface RoadEntry { line: Point[]; halfWidth: number; fit: GroundFit; heightAlong: (p: Point) => number; box: Box; yields: Array<[number, number]> }

/** The points' box grown by `grow` metres: a fit only reaches points inside it (the fit index). */
function boxOf(points: Point[], grow: number): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { minX: minX - grow, minY: minY - grow, maxX: maxX + grow, maxY: maxY + grow }
}

const inBox = (b: Box, x: number, y: number) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY

export function createTerrainSampler(doc: CampusDocument, opts: TerrainSamplerOptions = {}): TerrainSampler | null {
  const terrain = doc.terrain
  if (!terrain) return null
  const grid = terrain.grid
  const base = terrain.base
  const tiles = doc.terrainTiles ?? {}
  const decoded = new Map<string, Int16Array | null>()

  const tileCells = (id: TileId): Int16Array | null => {
    const override = opts.tilesOverride?.get(id)
    if (override) return override
    if (decoded.has(id)) return decoded.get(id)!
    const encoded = tiles[id]
    const cells = typeof encoded === 'string' ? decodeTile(encoded) : null
    decoded.set(id, cells)
    return cells
  }
  // Remembers the last tile read (most lookups stay in one tile); a stroke adding a tile resets it.
  let lastCol = NaN
  let lastRow = NaN
  let lastCells: Int16Array | null = null
  let lastOverrideSize = -1
  const cellCm = (cx: number, cy: number): number => {
    const { col, row, i } = tileOfCell(cx, cy)
    const overrideSize = opts.tilesOverride?.size ?? 0
    if (col !== lastCol || row !== lastRow || overrideSize !== lastOverrideSize) {
      lastCells = tileCells(tileIdOf(col, row))
      lastCol = col
      lastRow = row
      lastOverrideSize = overrideSize
    }
    return lastCells ? lastCells[i] : 0
  }

  // Past the edge of an imported ground the height continues from its nearest edge (no cliff to 0 m).
  const baseAt = (x: number, y: number) => (base ? sampleBaseExtended(base, grid, x, y) ?? 0 : 0)
  const changeAt = (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const v00 = cellCm(x0, y0)
    const v10 = fx > 0 ? cellCm(x0 + 1, y0) : 0
    const v01 = fy > 0 ? cellCm(x0, y0 + 1) : 0
    const v11 = fx > 0 && fy > 0 ? cellCm(x0 + 1, y0 + 1) : 0
    const cm = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
    return cm / 100
  }
  const sculptingHidden = opts.studioView === true && terrain.sculptingHidden === true
  const visibleChangeAt = sculptingHidden ? () => 0 : changeAt
  const sculptedAt = (x: number, y: number) => baseAt(x, y) + visibleChangeAt(x, y)
  // Meshes, in list order (a later mesh wins where they overlap); invalid ones are skipped.
  const meshes = (opts.meshesOverride ?? terrain.meshes ?? [])
    .filter(isValidMesh)
    .filter((mesh) => !(opts.studioView === true && mesh.hidden === true))
    .map((mesh) => ({ mesh, frame: meshFrame(mesh, grid) }))
  const groundAt = meshes.length === 0 ? sculptedAt : (x: number, y: number) => {
    let h = sculptedAt(x, y)
    for (const { mesh, frame } of meshes) {
      const weight = meshWeightAt(frame, mesh, { x, y })
      if (weight <= 0) continue
      const { u, v } = frame.toUV({ x, y })
      const value = meshValueAt(mesh, u, v)
      h += mesh.mode === 'keep-bumps' ? value * weight : (value - h) * weight
    }
    return h
  }

  const sampler: TerrainSampler = { grid, baseAt, changeAt: visibleChangeAt, sculptedAt, groundAt, fitAt: () => 0, heightAt: () => 0 }

  const pads: PadEntry[] = []
  for (const building of doc.buildings ?? []) {
    // Owner 2026-11-14: a building's own outline is its floor (no ground inside any building).
    // Owner 2026-11-15, banks and plinths: uphill a 1 m walkway then a bank at the building's slope; downhill the
    // hill is left alone (the building shows a plinth), or filled for "Slopes all round".
    const ring = outlineOf(building, grid)
    if (ring.length < 3) continue
    const { around, slope } = groundAroundOf(building)
    let cached: number | null = null
    const reach = around === 'leave' ? 0 : WALKWAY_M + BANK_REACH_M
    pads.push({ ring, around, slope, base: () => (cached ??= effectiveBuildingBase(building, sampler, grid)), box: boxOf(ring, reach + 0.01) })
  }

  const roads: RoadEntry[] = []
  // Graded roads (Grade tool): a smoothed profile through their pins, typed ends and shared junction heights.
  const graded: Array<{ id: string; line: Point[]; halfWidth: number; fit: GroundFit; grade: NonNullable<Road['grade']>; ends: { start?: number; end?: number } }> = []
  // Owner 2026-11-15: every road owns its platform (level across, straight grades along) unless its ground fit is
  // explicitly Off; a road without settings gets Raise and lower with a 3 m shoulder.
  const profileOf = (g: { line: Point[]; grade: NonNullable<Road['grade']>; ends: { start?: number; end?: number } }, pins: GradePin[]) =>
    (g.grade.shape === 'follow'
      ? roadGradeProfile(g.line, groundAt, { ...g.grade, pins }, g.ends)
      : platformProfile(g.line, groundAt, pins, g.ends))
  for (const road of doc.roads ?? []) {
    const fit = road.groundFit ?? DEFAULT_ROAD_FIT
    if (fit.mode === 'off') continue
    // The walking route along a stair or ramp: the structure is its surface; it never shapes the ground.
    if (road.routing?.structureId) continue
    const line = (road.polyline?.points ?? []).map((p) => toLocal(grid, p))
    if (line.length < 2) continue
    const halfWidth = (road.width ?? 0) / 2
    const typed = road.heightMode === 'typed'
    graded.push({
      id: road.id, line, halfWidth, fit, grade: road.grade ?? { smoothness: 1 },
      ends: typed ? { start: road.routing?.startElevationMeters, end: road.routing?.endElevationMeters } : {},
    })
  }
  if (graded.length > 0) {
    const first = graded.map((g) => ({ ...g, pins: g.grade.pins ?? [], profile: profileOf(g, g.grade.pins ?? []) }))
    // Seamless junctions (2026-11-15): computed twice, so a side road meets the main road's final surface.
    const zone = Math.max(0, ...first.map((g) => g.halfWidth)) + 1
    const finalPins = (g: typeof first[number], junction: { pins: GradePin[]; yields: Array<[number, number]> } | undefined) => {
      const jp = junction?.pins ?? []
      const inYield = (s: number) => (junction?.yields ?? []).some(([a, b]) => s >= a - 1e-6 && s <= b + 1e-6)
      // A road's own pins inside another road, or right beside a junction height, would make a step: the junction wins.
      const own = g.pins.filter((p) => !inYield(p.alongM) && !jp.some((j) => Math.abs(j.alongM - p.alongM) < zone && Math.abs(j.heightM - p.heightM) > 1e-6))
      return [...own, ...jp]
    }
    let current = first
    let shapes = junctionShapes(current)
    current = first.map((g) => ({ ...g, profile: profileOf(g, finalPins(g, shapes.get(g.id))) }))
    shapes = junctionShapes(current.map((g) => ({ ...g, pins: g.pins })))
    for (const g of first) {
      const junction = shapes.get(g.id)
      const profile = profileOf(g, finalPins(g, junction))
      const heightAlong = (p: Point) => profile.heightAtAlong(alongOf(g.line, p).along)
      roads.push({ line: g.line, halfWidth: g.halfWidth, fit: g.fit, heightAlong, yields: junction?.yields ?? [], box: boxOf(g.line, g.halfWidth + g.fit.blendMeters + ROAD_BANK_REACH_M + 0.01) })
    }
  }

  const fitAt = (x: number, y: number): number => {
    const p = { x, y }
    // Buildings: inside an outline the floor always wins. Outside, every building's bank cuts (the deepest cut
    // wins) and "Slopes all round" fills (the highest fill wins), so overlapping banks meet without a seam.
    let ground: number | null = null
    let target: number | null = null
    for (const pad of pads) {
      if (!inBox(pad.box, x, y)) continue // a building never reaches beyond its box
      ground ??= groundAt(x, y)
      const d = distanceToSegments(p, pad.ring, true)
      // On the walls counts as inside: no ground shows along a building's own walls.
      if (d <= 1e-6 || pointInPolygon(p, pad.ring)) return pad.base() - ground
      if (pad.around === 'leave') continue
      if (d > WALKWAY_M + BANK_REACH_M) continue
      const floor = pad.base()
      const rise = pad.slope * Math.max(0, d - WALKWAY_M)
      // Where the hill is as steep as the bank it never meets it: the last 5 m of the reach ease into the hill
      // instead of leaving a cliff at the reach.
      const ease = smoothstep01((d - (WALKWAY_M + BANK_REACH_M - EASE_M)) / EASE_M)
      const current = target ?? ground
      if (ground > floor) target = Math.min(current, floor + rise + (ground - floor - rise > 0 ? (ground - floor - rise) * ease : 0))
      else if (pad.around === 'slopes' && ground < floor) target = Math.max(current, floor - rise - (floor - rise - ground > 0 ? (floor - rise - ground) * ease : 0))
    }
    const buildingDelta = target === null || ground === null ? 0 : target - ground
    // Roads (owner 2026-11-15: a cut road showed a jagged wall beside it): on the surface the road height; beside
    // it a level shoulder (Edge width) and then a bank at 1 in 2 back to the hill — cut where the hill is higher,
    // filled where it is lower (by the road's mode). Like buildings, the deepest cut / highest fill wins.
    let bestRoad: { distance: number; delta: number } | null = null
    let roadTarget: number | null = null
    for (const road of roads) {
      if (!inBox(road.box, x, y)) continue
      const centre = distanceToSegments(p, road.line, false)
      const outside = Math.max(0, centre - road.halfWidth)
      // Inside another road at a junction this road yields: the other road's surface is the ground there.
      if (road.yields.length > 0 && outside <= 0) {
        const s = alongOf(road.line, p).along
        if (road.yields.some(([a, b]) => s > a + 1e-6 && s < b - 1e-6)) continue
      }
      if (outside > road.fit.blendMeters + ROAD_BANK_REACH_M) continue
      ground ??= groundAt(x, y)
      const roadH = road.heightAlong(p)
      if (outside <= 0) {
        const delta = roadH - ground
        if (fitApplies(road.fit.mode, delta) && (!bestRoad || bestRoad.distance > 0)) bestRoad = { distance: 0, delta }
        continue
      }
      const beyond = outside - road.fit.blendMeters
      const rise = ROAD_BANK_SLOPE * Math.max(0, beyond)
      const ease = smoothstep01((beyond - (ROAD_BANK_REACH_M - EASE_M)) / EASE_M)
      const current = roadTarget ?? ground
      if (ground > roadH + rise && fitApplies(road.fit.mode, -1)) roadTarget = Math.min(current, roadH + rise + (ground - roadH - rise) * ease)
      else if (ground < roadH - rise && fitApplies(road.fit.mode, 1)) roadTarget = Math.max(current, roadH - rise - (roadH - rise - ground) * ease)
    }
    if (!bestRoad && roadTarget !== null && ground !== null && roadTarget !== ground) bestRoad = { distance: 1, delta: roadTarget - ground }
    // On a road's own surface the road wins over a building's dig-out strip or blend beside it, so a road passing
    // close to a building stays level across (owner 2026-11-15: it was tilted and creased). Elsewhere buildings win.
    if (bestRoad && bestRoad.distance <= 0) return bestRoad.delta
    if (buildingDelta !== 0) return buildingDelta
    return bestRoad ? bestRoad.delta : 0
  }

  sampler.fitAt = fitAt
  sampler.heightAt = (x, y) => groundAt(x, y) + fitAt(x, y)
  return sampler
}

/** Height along a road: typed start/end elevations, else the ground at its two ends; linear by distance along the line. */
function roadProfile(road: Road, line: Point[], groundAt: (x: number, y: number) => number): (p: Point) => number {
  const lengths = [0]
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y))
  const total = lengths[lengths.length - 1] || 1
  const typed = road.heightMode === 'typed'
  const start = typed && Number.isFinite(road.routing?.startElevationMeters) ? road.routing!.startElevationMeters! : groundAt(line[0].x, line[0].y)
  const last = line[line.length - 1]
  const end = typed && Number.isFinite(road.routing?.endElevationMeters) ? road.routing!.endElevationMeters! : groundAt(last.x, last.y)
  return (p: Point) => {
    let best = { distance: Infinity, along: 0 }
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const dx = line[i].x - a.x
      const dy = line[i].y - a.y
      const len2 = dx * dx + dy * dy
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
      const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
      if (distance < best.distance) best = { distance, along: lengths[i - 1] + t * (lengths[i] - lengths[i - 1]) }
    }
    return start + ((end - start) * best.along) / total
  }
}

// ── structures ──────────────────────────────────────────────────────────────

export interface ResolvedStructure {
  start: { x: number; y: number; h: number }
  end: { x: number; y: number; h: number }
  bend?: Point
  /** True when a slab end's building or floor is gone and its last position is used. */
  orphanStart: boolean
  orphanEnd: boolean
}

/**
 * Where a structure's ends are and how high: a slab end sits on its building's outline edge at
 * base + floor elevation; road and ground ends take the final ground height there (structures read
 * the ground, never road surfaces, so road ↔ structure heights cannot loop), plus their heightOffset.
 * heightOverride wins.
 */
export function resolveStructureEnds(doc: CampusDocument, sampler: TerrainSampler, structure: Structure): ResolvedStructure | null {
  const grid = sampler.grid
  const endOf = (end: Structure['start'], override: number | undefined, offset?: number): { x: number; y: number; h: number; orphan: boolean } | null => {
    if (end.kind === 'slab') {
      const building = doc.buildings.find((b) => b.id === end.buildingId)
      const floor = building?.floors.find((f) => f.id === end.floorId)
      const ring = building ? outlineOf(building, grid) : []
      if (!building || !floor || ring.length < 2) {
        if (!end.last) return null
        const p = toLocal(grid, end.last)
        return { x: p.x, y: p.y, h: override ?? end.last.heightM, orphan: true }
      }
      const a = ring[((end.edgeIndex % ring.length) + ring.length) % ring.length]
      const b = ring[(end.edgeIndex + 1) % ring.length]
      const x = a.x + (b.x - a.x) * end.edgeT
      const y = a.y + (b.y - a.y) * end.edgeT
      const h = override ?? effectiveBuildingBase(building, sampler, grid) + floor.elevation
      return { x, y, h, orphan: false }
    }
    const p = toLocal(grid, end.position)
    return { x: p.x, y: p.y, h: override ?? sampler.heightAt(p.x, p.y) + (offset ?? 0), orphan: false }
  }
  const start = endOf(structure.start, structure.heightOverride?.start, structure.heightOffset?.start)
  const end = endOf(structure.end, structure.heightOverride?.end, structure.heightOffset?.end)
  if (!start || !end) return null
  // A road end on the road surface lands on the road's edge facing the stair (owner 2026-11-15: stairs saved with
  // an end in the middle of the road did not meet it).
  const toEdge = (which: 'start' | 'end', at: { x: number; y: number; h: number }, other: { x: number; y: number }) => {
    const e = structure[which]
    if (e.kind !== 'road') return
    const road = (doc.roads ?? []).find((r) => r.id === e.roadId)
    const line = (road?.polyline?.points ?? []).map((q) => toLocal(grid, q))
    const half = (road?.width ?? 0) / 2
    if (!road || line.length < 2 || half <= 0) return
    const { along, distance } = alongOf(line, at)
    if (distance > half + 1e-6) return
    const c = pointAlong(line, along)
    const ahead = pointAlong(line, along + 0.05)
    const behind = pointAlong(line, Math.max(0, along - 0.05))
    let nx = -(ahead.y - behind.y)
    let ny = ahead.x - behind.x
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    if (nx * (other.x - c.x) + ny * (other.y - c.y) < 0) { nx = -nx; ny = -ny }
    at.x = c.x + nx * half
    at.y = c.y + ny * half
    const override = structure.heightOverride?.[which]
    at.h = override ?? sampler.heightAt(at.x, at.y) + (structure.heightOffset?.[which] ?? 0)
  }
  toEdge('start', start, end)
  toEdge('end', end, start)
  return {
    start: { x: start.x, y: start.y, h: start.h },
    end: { x: end.x, y: end.y, h: end.h },
    ...(structure.bend ? { bend: toLocal(grid, structure.bend) } : {}),
    orphanStart: start.orphan,
    orphanEnd: end.orphan,
  }
}

/** Top-surface height of a structure at arc length s (stairs: step tops; ramps: level landings, straight slopes between). */
export function structureTopAt(structure: Structure, resolved: ResolvedStructure, length: number, s: number): number {
  const { start, end } = resolved
  const rise = end.h - start.h
  // Landings, steepness, landing heights (2026-11-15); older structures keep their original shape below.
  if (usesProfile(structure)) return structureProfile(structure.form, start.h, rise, length, structure).heightAt(s)
  if (structure.form === 'stairs') {
    const shape = stairShape(rise, length, structure.flight)
    // The flight's top edge belongs to the start (slab or landing); each tread is one riser on.
    if (shape.steps === 0 || s <= shape.flightStartM + 1e-9) return start.h
    if (s >= shape.flightEndM) return end.h
    const step = Math.min(shape.steps, Math.floor((s - shape.flightStartM) / (shape.treadM || 1)) + 1)
    return start.h + shape.riserM * step
  }
  return rampHeightAt(start.h, rise, length, structure.landings ?? [], s)
}

/** Top of a structure under p, else the final ground height. */
export function surfaceHeightAt(doc: CampusDocument, sampler: TerrainSampler, p: { lat: number; lng: number }): number {
  const q = toLocal(sampler.grid, p)
  for (const structure of doc.structures ?? []) {
    const resolved = resolveStructureEnds(doc, sampler, structure)
    if (!resolved) continue
    const path = structurePath(resolved.start, resolved.end, resolved.bend)
    const hit = path.nearest(q)
    if (hit.distance <= structure.width / 2 + 1e-9) return structureTopAt(structure, resolved, path.length, hit.s)
  }
  return sampler.heightAt(q.x, q.y)
}
