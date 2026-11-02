import type { CampusDocument } from '../types/document'
import type { Building, Road } from '../types/entities'
import type { Structure } from '../structures/types'
import { structurePath } from '../structures/path'
import { stairShape } from '../structures/stair-shape'
import { sampleBase } from './base-surface'
import { decodeTile, tileIdOf, tileOfCell, toLocal } from './grid'
import type { GroundFit, TerrainGrid, TileId } from './types'

type Point = { x: number; y: number }

export interface TerrainSampler {
  grid: TerrainGrid
  /** Metres; 0 where there is no base. */
  baseAt(x: number, y: number): number
  /** Metres from the change tiles (bilinear between cells). */
  changeAt(x: number, y: number): number
  /** base + change (no fits): the ground buildings follow. */
  groundAt(x: number, y: number): number
  /** Metres delta from building pads and road fits. */
  fitAt(x: number, y: number): number
  /** base + change + fit. */
  heightAt(x: number, y: number): number
}

export interface TerrainSamplerOptions {
  /** Working tiles of a stroke in progress; they replace the document's tiles with the same id. */
  tilesOverride?: Map<TileId, Int16Array>
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

interface PadEntry { ring: Point[]; fit: GroundFit; base: () => number }
interface RoadEntry { line: Point[]; halfWidth: number; fit: GroundFit; heightAlong: (p: Point) => number }

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
  const cellCm = (cx: number, cy: number): number => {
    const { col, row, i } = tileOfCell(cx, cy)
    const cells = tileCells(tileIdOf(col, row))
    return cells ? cells[i] : 0
  }

  const baseAt = (x: number, y: number) => (base ? sampleBase(base, grid, x, y) ?? 0 : 0)
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
  const groundAt = (x: number, y: number) => baseAt(x, y) + changeAt(x, y)

  const sampler: TerrainSampler = { grid, baseAt, changeAt, groundAt, fitAt: () => 0, heightAt: () => 0 }

  const pads: PadEntry[] = []
  for (const building of doc.buildings ?? []) {
    const fit = building.ground?.pad
    if (!fit || fit.mode === 'off') continue
    const ring = outlineOf(building, grid)
    if (ring.length < 3) continue
    let cached: number | null = null
    pads.push({ ring, fit, base: () => (cached ??= effectiveBuildingBase(building, sampler, grid)) })
  }

  const roads: RoadEntry[] = []
  for (const road of doc.roads ?? []) {
    const fit = road.groundFit
    if (!fit || fit.mode === 'off') continue
    const line = (road.polyline?.points ?? []).map((p) => toLocal(grid, p))
    if (line.length < 2) continue
    roads.push({ line, halfWidth: (road.width ?? 0) / 2, fit, heightAlong: roadProfile(road, line, groundAt) })
  }

  const fitAt = (x: number, y: number): number => {
    const p = { x, y }
    let bestPad: { distance: number; delta: number } | null = null
    for (const pad of pads) {
      const inside = pointInPolygon(p, pad.ring)
      const distance = inside ? 0 : distanceToSegments(p, pad.ring, true)
      if (distance > pad.fit.blendMeters) continue
      if (bestPad && distance >= bestPad.distance) continue
      const delta = pad.base() - groundAt(x, y)
      if (!fitApplies(pad.fit.mode, delta)) continue
      bestPad = { distance, delta: delta * (inside ? 1 : blendWeight(distance, pad.fit.blendMeters)) }
    }
    if (bestPad) return bestPad.delta
    let bestRoad: { distance: number; delta: number } | null = null
    for (const road of roads) {
      const centre = distanceToSegments(p, road.line, false)
      const outside = Math.max(0, centre - road.halfWidth)
      if (outside > road.fit.blendMeters) continue
      if (bestRoad && outside >= bestRoad.distance) continue
      const delta = road.heightAlong(p) - groundAt(x, y)
      if (!fitApplies(road.fit.mode, delta)) continue
      bestRoad = { distance: outside, delta: delta * blendWeight(outside, road.fit.blendMeters) }
    }
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
}

/**
 * Where a structure's ends are and how high: a slab end sits on its building's outline edge at
 * base + floor elevation; road and ground ends take the final ground height there (structures read
 * the ground, never road surfaces, so road ↔ structure heights cannot loop). heightOverride wins.
 */
export function resolveStructureEnds(doc: CampusDocument, sampler: TerrainSampler, structure: Structure): ResolvedStructure | null {
  const grid = sampler.grid
  const endOf = (end: Structure['start'], override: number | undefined) => {
    if (end.kind === 'slab') {
      const building = doc.buildings.find((b) => b.id === end.buildingId)
      if (!building) return null
      const ring = outlineOf(building, grid)
      if (ring.length < 2) return null
      const a = ring[((end.edgeIndex % ring.length) + ring.length) % ring.length]
      const b = ring[(end.edgeIndex + 1) % ring.length]
      const x = a.x + (b.x - a.x) * end.edgeT
      const y = a.y + (b.y - a.y) * end.edgeT
      const floor = building.floors.find((f) => f.id === end.floorId)
      const h = override ?? effectiveBuildingBase(building, sampler, grid) + (floor?.elevation ?? 0)
      return { x, y, h }
    }
    const p = toLocal(grid, end.position)
    return { x: p.x, y: p.y, h: override ?? sampler.heightAt(p.x, p.y) }
  }
  const start = endOf(structure.start, structure.heightOverride?.start)
  const end = endOf(structure.end, structure.heightOverride?.end)
  if (!start || !end) return null
  return { start, end, ...(structure.bend ? { bend: toLocal(grid, structure.bend) } : {}) }
}

/** Top-surface height of a structure at arc length s (stairs: step tops; ramps: straight slope). */
export function structureTopAt(structure: Structure, resolved: ResolvedStructure, length: number, s: number): number {
  const { start, end } = resolved
  const rise = end.h - start.h
  if (structure.form === 'stairs') {
    const shape = stairShape(rise, length, structure.flight)
    if (shape.steps === 0 || s < shape.flightStartM) return start.h
    if (s >= shape.flightEndM) return end.h
    const step = Math.min(shape.steps, Math.floor((s - shape.flightStartM) / (shape.treadM || 1)) + 1)
    return start.h + shape.riserM * step
  }
  return length > 0 ? start.h + (rise * Math.min(Math.max(s, 0), length)) / length : start.h
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
