import type { CampusDocument } from '../types/document'
import type { Structure, StructurePreset } from '../structures/types'
import { structurePath } from '../structures/path'
import { bakeTerrain } from './bake'
import { createTerrainSampler, effectiveBuildingBase, resolveStructureEnds, structureTopAt, surfaceHeightAt, type TerrainSampler } from './compose'
import { decodeInt16, gridOriginForBoundary, toLatLng, toLocal } from './grid'
import type { BakedTerrain, TerrainGrid } from './types'

type LatLng = { lat: number; lng: number }

export interface SiteRoadSurface {
  id: string
  polyline: LatLng[]
  width: number
  type: string
  startHeightM: number
  endHeightM: number
}

export interface SiteStructure extends Structure {
  /** Resolved end positions (start, end) and heights; `bend` stays on the structure. */
  resolved: { startHeightM: number; endHeightM: number; path: LatLng[] }
}

/** What NAVI Web needs to draw the campus: only the campus, published as one package. */
export interface SiteArtifact {
  version: 1
  boundary: LatLng[]
  terrain: BakedTerrain | null
  roads: SiteRoadSurface[]
  structures: SiteStructure[]
  /** Only the presets used by `structures`. */
  presets: StructurePreset[]
  /** Effective building base heights. */
  buildings: Array<{ id: string; baseM: number }>
}

/** A flat sampler for campuses without terrain (0 m ground; pads and heights still resolve). */
function samplerFor(doc: CampusDocument): TerrainSampler | null {
  const own = createTerrainSampler(doc)
  if (own) return own
  const boundary = doc.boundary?.points ?? []
  if (boundary.length < 3) return null
  return createTerrainSampler({
    ...doc,
    terrain: { reference: { name: 'Flat', zeroMeaning: 'No terrain' }, grid: gridOriginForBoundary(boundary), colorRange: { minM: 0, maxM: 1 } },
  })
}

/** null when the campus has no boundary (nothing to frame the campus-only map). */
export function buildSiteArtifact(doc: CampusDocument): SiteArtifact | null {
  const boundary = doc.boundary?.points ?? []
  const sampler = samplerFor(doc)
  if (boundary.length < 3 || !sampler) return null

  const roads: SiteRoadSurface[] = (doc.roads ?? []).flatMap((road) => {
    const polyline = road.polyline?.points ?? []
    if (polyline.length < 2) return []
    const typed = road.heightMode === 'typed'
    const start = typed && Number.isFinite(road.routing?.startElevationMeters) ? road.routing!.startElevationMeters! : surfaceHeightAt(doc, sampler, polyline[0])
    const end = typed && Number.isFinite(road.routing?.endElevationMeters) ? road.routing!.endElevationMeters! : surfaceHeightAt(doc, sampler, polyline[polyline.length - 1])
    return [{ id: road.id, polyline: polyline.map((p) => ({ lat: p.lat, lng: p.lng })), width: road.width, type: String(road.type), startHeightM: start, endHeightM: end }]
  })

  const structures: SiteStructure[] = (doc.structures ?? []).flatMap((structure) => {
    const resolved = resolveStructureEnds(doc, sampler, structure)
    if (!resolved) return []
    return [{
      ...structure,
      resolved: {
        startHeightM: resolved.start.h,
        endHeightM: resolved.end.h,
        path: [toLatLng(sampler.grid, resolved.start), toLatLng(sampler.grid, resolved.end)],
      },
    }]
  })

  const used = new Set(structures.map((s) => s.presetId))
  return {
    version: 1,
    boundary: boundary.map((p) => ({ lat: p.lat, lng: p.lng })),
    terrain: bakeTerrain(doc),
    roads,
    structures,
    presets: (doc.structurePresets ?? []).filter((preset) => used.has(preset.id)),
    buildings: (doc.buildings ?? []).map((building) => ({ id: building.id, baseM: effectiveBuildingBase(building, sampler) })),
  }
}

/** Surface height for NAVI Web: the top of a structure where p lies on one, else the baked ground (bilinear), else 0. */
export function createSiteSurface(site: SiteArtifact): (p: LatLng) => number {
  const terrain = site.terrain
  const cells = terrain ? decodeInt16(terrain.heightsCm) : null
  const grid: TerrainGrid = terrain
    ? { originLat: terrain.originLat, originLng: terrain.originLng }
    : { originLat: site.boundary[0]?.lat ?? 0, originLng: site.boundary[0]?.lng ?? 0 }

  const groundAt = (x: number, y: number): number => {
    if (!terrain || !cells) return 0
    const cx = Math.min(Math.max(x, 0), terrain.cols - 1)
    const cy = Math.min(Math.max(y, 0), terrain.rows - 1)
    const x0 = Math.floor(cx)
    const y0 = Math.floor(cy)
    const x1 = Math.min(x0 + 1, terrain.cols - 1)
    const y1 = Math.min(y0 + 1, terrain.rows - 1)
    const fx = cx - x0
    const fy = cy - y0
    const at = (col: number, row: number) => cells[row * terrain.cols + col]
    const cm = at(x0, y0) * (1 - fx) * (1 - fy) + at(x1, y0) * fx * (1 - fy) + at(x0, y1) * (1 - fx) * fy + at(x1, y1) * fx * fy
    return cm / 100
  }

  const shapes = site.structures.map((structure) => {
    const [a, b] = structure.resolved.path
    const start = { ...toLocal(grid, a), h: structure.resolved.startHeightM }
    const end = { ...toLocal(grid, b), h: structure.resolved.endHeightM }
    const bend = structure.bend ? toLocal(grid, structure.bend) : undefined
    return { structure, resolved: { start, end, ...(bend ? { bend } : {}) }, path: structurePath(start, end, bend) }
  })

  return (p: LatLng) => {
    const q = toLocal(grid, p)
    for (const shape of shapes) {
      const hit = shape.path.nearest(q)
      if (hit.distance <= shape.structure.width / 2 + 1e-9) return structureTopAt(shape.structure, shape.resolved, shape.path.length, hit.s)
    }
    return groundAt(q.x, q.y)
  }
}
