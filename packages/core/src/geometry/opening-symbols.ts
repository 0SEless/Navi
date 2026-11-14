import type { Opening, Wall } from '../types/entities'
import { resolveDoorStyle, resolveWindowStyle } from '../assets/opening-style'
import { resolveDoorApertures, type DoorAssetInput } from './door-assets'

/** 2D plan symbols in building-local coordinates. Decorative only. */
export interface OpeningPlanSymbols {
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString>
  markers: GeoJSON.FeatureCollection<GeoJSON.Point>
}

const ARC_SEGMENTS = 24

/**
 * Standard architectural plan symbols for doors and windows:
 * - hinged: leaf drawn fully open plus a quarter-circle swing arc (radius = leaf width) on the swing side
 * - double: two half-width leaves and arcs meeting at the centre
 * - sliding: two panel lines on offset tracks inside the wall, plus a slide arrow
 * - archway (no leaf): a jamb tick at each side
 * - folding: zigzag across the opening; rolling: dashed shutter line with head-box ticks
 * - fire: hinged symbol plus a 'fire' marker point at the centre
 * - window: outer face, glass and inner face lines (two-pane splits the glass line; sliding offsets two halves;
 *   jalousie and vent-block add hatch strokes; casement and awning add a dashed swing indicator)
 * Invalid or unresolved openings produce nothing.
 */
export function buildOpeningPlanSymbols(walls: readonly Wall[], openings: readonly Opening[], doors: readonly DoorAssetInput[]): OpeningPlanSymbols {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = []
  const markers: GeoJSON.Feature<GeoJSON.Point>[] = []

  for (const a of resolveDoorApertures(walls, openings.filter(o => o.type === 'door'), doors)) {
    const ids = { ...(a.doorId ? { doorId: a.doorId } : {}), ...(a.openingId ? { openingId: a.openingId } : {}) }
    const style = resolveDoorStyle({ doorType: a.doorType as never, doorAppearance: a.appearance, doorPose: a.pose, doorOperation: a.operation, hingeSide: a.hingeSide, swingSide: a.swingSide, assetPreset: a.assetPreset, material: a.material, glass: a.glass })
    const nx = -a.uy, ny = a.ux
    const sign = style.swingSide === 'right' ? -1 : 1
    const at = (along: number, normal = 0) => [a.x + a.ux * along + nx * normal, a.y + a.uy * along + ny * normal]
    let n = 0
    const push = (kind: string, coordinates: number[][]) => {
      const id = `${a.id}:${kind}:${n++}`
      lines.push({ type: 'Feature', id, properties: { id, kind, ...ids }, geometry: { type: 'LineString', coordinates } })
    }
    const w = a.width, half = a.depth / 2

    if (style.operation === 'none') {
      push('jamb', [at(0, -half), at(0, half)])
      push('jamb', [at(w, -half), at(w, half)])
      continue
    }
    if (style.operation === 'sliding') {
      const q = a.depth / 4
      push('panel', [at(0, -q), at(w * 0.55, -q)])
      push('panel', [at(w * 0.45, q), at(w, q)])
      push('arrow', [at(w * 0.7), at(w * 0.3), at(w * 0.4, q * 0.6), at(w * 0.3), at(w * 0.4, -q * 0.6)])
    } else if (style.operation === 'folding') {
      // Zigzag across the opening: each of the 4 panels is a V, giving 2 × panels + 1 points.
      const panels = 4, peak = sign * Math.min(w / panels / 2, a.depth)
      const zig: number[][] = []
      for (let i = 0; i <= panels * 2; i++) zig.push(at(w * i / (panels * 2), i % 2 === 1 ? peak : 0))
      push('fold', zig)
    } else if (style.operation === 'rolling') {
      // Dashed shutter line across the opening, with a head-box tick at each end.
      push('shutter', [at(0), at(w)])
      push('head-box', [at(0, -half), at(0, half)])
      push('head-box', [at(w, -half), at(w, half)])
    } else {
      const leaves = style.leaves === 2
        ? [{ hinge: 0, dir: 1, length: w / 2 }, { hinge: w, dir: -1, length: w / 2 }]
        : [style.hingeSide === 'end' ? { hinge: w, dir: -1, length: w } : { hinge: 0, dir: 1, length: w }]
      for (const leaf of leaves) {
        push('leaf', [at(leaf.hinge), at(leaf.hinge, sign * leaf.length)])
        const arc: number[][] = []
        for (let i = 0; i <= ARC_SEGMENTS; i++) {
          const t = (i / ARC_SEGMENTS) * Math.PI / 2
          arc.push(at(leaf.hinge + leaf.dir * leaf.length * Math.cos(t), sign * leaf.length * Math.sin(t)))
        }
        push('arc', arc)
      }
    }
    if (style.fire) {
      const id = `${a.id}:fire`
      markers.push({ type: 'Feature', id, properties: { id, kind: 'fire', ...ids }, geometry: { type: 'Point', coordinates: at(w / 2) } })
    }
  }

  const hosts = new Map(walls.map(wall => [wall.id, wall]))
  for (const opening of openings) {
    if (opening.type !== 'window') continue
    const wall = hosts.get(opening.wallId)
    if (!wall) continue
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const start = opening.offset, end = opening.offset + opening.width
    if (![length, start, end, wall.thickness].every(Number.isFinite) || length <= 0 || opening.width <= 0 || start < 0 || end > length + 1e-9) continue
    const ux = (wall.end.x - wall.start.x) / length, uy = (wall.end.y - wall.start.y) / length
    const at = (along: number, normal: number) => [wall.start.x + ux * along - uy * normal, wall.start.y + uy * along + ux * normal]
    const half = wall.thickness / 2
    let n = 0
    const push = (kind: string, coordinates: number[][]) => {
      const id = `${opening.id}:${kind}:${n++}`
      lines.push({ type: 'Feature', id, properties: { id, kind, openingId: opening.id }, geometry: { type: 'LineString', coordinates } })
    }
    const type = resolveWindowStyle(opening).type
    push('window-face', [at(start, half), at(end, half)])
    if (type === 'two-pane') {
      const middle = (start + end) / 2, gap = Math.min(0.03, opening.width / 10)
      push('window-glass', [at(start, 0), at(middle - gap / 2, 0)])
      push('window-glass', [at(middle + gap / 2, 0), at(end, 0)])
    } else if (type === 'sliding') {
      // Two sashes on offset tracks, overlapping at the middle.
      const middle = (start + end) / 2, overlap = Math.min(0.05, opening.width / 10), track = half / 3
      push('window-glass', [at(start, -track), at(middle + overlap / 2, -track)])
      push('window-glass', [at(middle - overlap / 2, track), at(end, track)])
    } else if (type !== 'vent-block') push('window-glass', [at(start, 0), at(end, 0)])
    if (type === 'jalousie' || type === 'vent-block') {
      // Short diagonal hatch strokes across the wall thickness (louvres or breeze-block cells).
      const strokes = Math.max(4, Math.min(12, Math.round(opening.width / 0.15)))
      for (let i = 0; i < strokes; i++) {
        const a = start + opening.width * (i + 0.2) / strokes, b = start + opening.width * (i + 0.8) / strokes
        push('window-hatch', [at(a, -half * 0.8), at(b, half * 0.8)])
      }
    }
    if (type === 'casement') {
      // Two leaves hung at the outer jambs: a dashed quarter arc for each, meeting at the centre.
      const leaf = opening.width / 2
      for (const [hinge, dir] of [[start, 1], [end, -1]] as const) {
        const arc: number[][] = []
        for (let i = 0; i <= ARC_SEGMENTS / 2; i++) {
          const t = (i / (ARC_SEGMENTS / 2)) * Math.PI / 2
          arc.push(at(hinge + dir * leaf * Math.cos(t), half + leaf * Math.sin(t)))
        }
        push('window-swing', arc)
      }
      push('window-mullion', [at(start + leaf, -half), at(start + leaf, half)])
    } else if (type === 'awning') {
      // Dashed line where the top-hung pane's bottom edge projects when open.
      push('window-swing', [at(start, half + opening.width / 4), at(end, half + opening.width / 4)])
    }
    push('window-face', [at(start, -half), at(end, -half)])
  }

  return { lines: { type: 'FeatureCollection', features: lines }, markers: { type: 'FeatureCollection', features: markers } }
}
