import type { Opening, Wall } from '../types/entities'
import { resolveWindowStyle } from '../assets/opening-style'
import { GLASS_STYLES, OPENING_MATERIAL_COLORS } from '../assets/opening-catalog'
import { WINDOW_APPEARANCES } from '../types/enums'

export interface WindowAssetVolumes {
  frames: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  glass: GeoJSON.FeatureCollection<GeoJSON.Polygon>
}

const JALOUSIE_SLATS = 8
const JALOUSIE_OPEN_TILT = Math.PI / 3
const AWNING_OPEN_TILT = Math.PI / 4
const AWNING_SLICES = 4

/** Pure building-local solids. `height` is absolute top elevation, like wall volumes.
 * Legacy absence means open (no solids). Sill and height are stored geometry: a preset never moves them.
 * Invalid/out-of-host assets are omitted, never repaired. At most 40 solids per window.
 */
export function buildWindowAssetVolumes(walls: readonly Wall[], openings: readonly Opening[], base = 0): WindowAssetVolumes {
  const result: WindowAssetVolumes = {
    frames: { type: 'FeatureCollection', features: [] },
    glass: { type: 'FeatureCollection', features: [] },
  }
  if (!Number.isFinite(base)) return result
  const hosts = new Map(walls.map(wall => [wall.id, wall]))
  for (const opening of openings) {
    if (opening.type !== 'window') continue
    const style = resolveWindowStyle(opening)
    // Unknown stored looks are omitted, never guessed.
    if (style.type === 'open' || !(WINDOW_APPEARANCES as readonly string[]).includes(style.type)) continue
    const wall = hosts.get(opening.wallId)
    if (!wall) continue
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const bottom = opening.sillHeight ?? 0.9, height = opening.height ?? 1.2
    const start = opening.offset, end = start + opening.width, top = bottom + height
    if (![wall.start.x, wall.start.y, wall.end.x, wall.end.y, length, wall.height, wall.thickness, start, end, bottom, top, opening.width, height].every(Number.isFinite)
      || length <= 0 || wall.height <= 0 || wall.thickness <= 0 || opening.width <= 0 || height <= 0
      || start < 0 || end > length || bottom < 0 || top > wall.height) continue
    const ux = (wall.end.x - wall.start.x) / length, uy = (wall.end.y - wall.start.y) / length
    // Bound breadth by both aperture axes, leaving positive glass even for tiny apertures.
    const breadth = Math.min(0.05, opening.width / 8, height / 8)
    const frameDepth = wall.thickness * 0.8
    const glassDepth = Math.min(0.012, wall.thickness * 0.2)
    // Colour only when a preset, material or glass is chosen, so unstyled windows keep their exact properties.
    const chosen = opening.assetPreset !== undefined || opening.material !== undefined || opening.glass !== undefined
    const colorProps = (kind: keyof WindowAssetVolumes): Record<string, unknown> => !chosen ? {}
      : kind === 'glass' ? { color: GLASS_STYLES[style.glass].color, glassOpacity: GLASS_STYLES[style.glass].opacity }
      : style.material ? { color: OPENING_MATERIAL_COLORS[style.material] } : {}
    /** A box from left..right along the wall, low..high in elevation; optionally shifted off the wall centre
     * and turned about a vertical hinge line at `hinge` along the wall. */
    const add = (kind: keyof WindowAssetVolumes, name: string, left: number, right: number, low: number, high: number, depth: number, move: { shift?: number; hinge?: number; angle?: number } = {}) => {
      if (!(right > left && high > low && base + high > base + low) || ![base + low, base + high].every(Number.isFinite)) return
      const shift = move.shift ?? 0, hinge = move.hinge ?? 0, cos = Math.cos(move.angle ?? 0), sin = Math.sin(move.angle ?? 0)
      const point = (along: number, normal: number) => {
        normal += shift
        const a = move.angle ? hinge + (along - hinge) * cos - normal * sin : along
        const n = move.angle ? (along - hinge) * sin + normal * cos : normal
        return [wall.start.x + ux * a - uy * n, wall.start.y + uy * a + ux * n]
      }
      const ring = [point(left, depth / 2), point(right, depth / 2), point(right, -depth / 2), point(left, -depth / 2), point(left, depth / 2)]
      // Extreme coordinate datums can swallow small dimensions; omit collapsed solids.
      const edge = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
      if (!ring.flat().every(Number.isFinite) || edge(ring[0], ring[1]) === 0 || edge(ring[1], ring[2]) === 0) return
      const id = `${opening.id}:${kind}:${name}`
      result[kind].features.push({ type: 'Feature', id, properties: { id, wallId: wall.id, openingId: opening.id, base: base + low, height: base + high, ...colorProps(kind) }, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
    add('frames', 'sill', start, end, bottom, bottom + breadth, frameDepth)
    add('frames', 'header', start, end, top - breadth, top, frameDepth)
    add('frames', 'left', start, start + breadth, bottom + breadth, top - breadth, frameDepth)
    add('frames', 'right', end - breadth, end, bottom + breadth, top - breadth, frameDepth)
    const inLeft = start + breadth, inRight = end - breadth, inLow = bottom + breadth, inHigh = top - breadth
    const open = style.pose === 'open'
    // Opening sashes get their own visible border (thicker than the glass) so each type reads differently in 2.5D.
    const sashBar = breadth * 0.8, sashDepth = Math.max(glassDepth * 3, frameDepth * 0.3)
    const sash = (prefix: string, left: number, right: number, low: number, high: number, move: { shift?: number; hinge?: number; angle?: number } = {}) => {
      add('frames', `${prefix}-sash-bottom`, left, right, low, low + sashBar, sashDepth, move)
      add('frames', `${prefix}-sash-top`, left, right, high - sashBar, high, sashDepth, move)
      add('frames', `${prefix}-sash-left`, left, left + sashBar, low + sashBar, high - sashBar, sashDepth, move)
      add('frames', `${prefix}-sash-right`, right - sashBar, right, low + sashBar, high - sashBar, sashDepth, move)
      add('glass', `${prefix}-pane`, left + sashBar, right - sashBar, low + sashBar, high - sashBar, glassDepth, move)
    }
    /** A top-hung sash tilted outward: extrusions are vertical prisms, so the tilted pane is drawn as stacked slices. */
    const tiltedSash = (prefix: string, low: number, high: number) => {
      const span = high - low
      add('frames', `${prefix}-sash-top`, inLeft, inRight, high - sashBar, high, sashDepth)
      for (let k = 0; k < AWNING_SLICES; k++) {
        const s0 = span * k / AWNING_SLICES, s1 = span * (k + 1) / AWNING_SLICES
        add('glass', `${prefix}-pane-${k + 1}`, inLeft, inRight, high - s1 * Math.cos(AWNING_OPEN_TILT), high - s0 * Math.cos(AWNING_OPEN_TILT),
          Math.max(glassDepth, (s1 - s0) * Math.sin(AWNING_OPEN_TILT)), { shift: (s0 + s1) / 2 * Math.sin(AWNING_OPEN_TILT) })
      }
    }
    switch (style.type) {
      case 'two-pane': {
        const middle = start + opening.width / 2
        add('frames', 'mullion', middle - breadth / 2, middle + breadth / 2, bottom + breadth, top - breadth, frameDepth)
        add('glass', 'left', start + breadth, middle - breadth / 2, bottom + breadth, top - breadth, glassDepth)
        add('glass', 'right', middle + breadth / 2, end - breadth, bottom + breadth, top - breadth, glassDepth)
        break
      }
      case 'sliding': {
        // Two framed sashes on separate tracks (one inside, one outside), overlapping at the middle.
        const middle = (inLeft + inRight) / 2, overlap = Math.min(0.06, (inRight - inLeft) / 10), track = frameDepth / 4
        sash('slide-1', inLeft, middle + overlap / 2, inLow, inHigh, { shift: -track })
        sash('slide-2', middle - overlap / 2, inRight, inLow, inHigh, { shift: track })
        break
      }
      case 'casement': {
        // Two framed leaves hung at the outer jambs with a centre mullion; open swings each leaf out 90 degrees.
        const middle = (inLeft + inRight) / 2, angle = open ? Math.PI / 2 : 0
        add('frames', 'mullion', middle - breadth / 2, middle + breadth / 2, inLow, inHigh, frameDepth)
        sash('leaf-left', inLeft, middle - breadth / 2, inLow, inHigh, { hinge: inLeft, angle })
        sash('leaf-right', middle + breadth / 2, inRight, inLow, inHigh, { hinge: inRight, angle: -angle })
        break
      }
      case 'awning': {
        // Two top-hung sashes stacked with a rail between; open tilts both outward.
        const middle = (inLow + inHigh) / 2
        add('frames', 'rail', inLeft, inRight, middle - breadth / 2, middle + breadth / 2, frameDepth)
        if (!open) {
          sash('upper', inLeft, inRight, middle + breadth / 2, inHigh)
          sash('lower', inLeft, inRight, inLow, middle - breadth / 2)
        } else {
          tiltedSash('upper', middle + breadth / 2, inHigh)
          tiltedSash('lower', inLow, middle - breadth / 2)
        }
        break
      }
      case 'jalousie': {
        // Side channels holding separate glass blades with gaps between them.
        // Closed blades stand nearly upright (each shows its own edge); open blades tilt 60 degrees.
        const rail = breadth * 0.6
        add('frames', 'channel-left', inLeft, inLeft + rail, inLow, inHigh, frameDepth * 0.6)
        add('frames', 'channel-right', inRight - rail, inRight, inLow, inHigh, frameDepth * 0.6)
        const pitch = (inHigh - inLow) / JALOUSIE_SLATS, blade = pitch * 0.82, tilt = open ? JALOUSIE_OPEN_TILT : 0
        for (let i = 0; i < JALOUSIE_SLATS; i++) {
          const centre = inLow + pitch * (i + 0.5), half = blade * Math.cos(tilt) / 2
          add('glass', `slat-${i + 1}`, inLeft + rail, inRight - rail, centre - half, centre + half, Math.max(glassDepth * 2, blade * Math.sin(tilt)))
        }
        break
      }
      case 'transom': {
        // Transom light: a heavy transom bar along the bottom and glazing bars dividing the glass into three lites.
        const bar = Math.min(breadth * 2, (inHigh - inLow) / 4)
        add('frames', 'transom-bar', inLeft, inRight, inLow, inLow + bar, frameDepth)
        const lites = 3, muntin = breadth * 0.5
        for (let i = 1; i < lites; i++) {
          const x = inLeft + (inRight - inLeft) * i / lites
          add('frames', `muntin-${i}`, x - muntin / 2, x + muntin / 2, inLow + bar, inHigh, sashDepth)
        }
        add('glass', 'pane', inLeft, inRight, inLow + bar, inHigh, glassDepth)
        break
      }
      case 'vent-block': {
        // Breeze-block lattice: bars between square cells, no glass.
        const cells = (size: number) => Math.min(8, Math.max(2, Math.round(size / 0.15)))
        const nx = cells(inRight - inLeft), ny = cells(inHigh - inLow)
        const bar = Math.min(0.04, (inRight - inLeft) / nx / 3, (inHigh - inLow) / ny / 3)
        for (let i = 1; i < nx; i++) { const x = inLeft + (inRight - inLeft) * i / nx; add('frames', `grid-v-${i}`, x - bar / 2, x + bar / 2, inLow, inHigh, frameDepth) }
        for (let j = 1; j < ny; j++) { const z = inLow + (inHigh - inLow) * j / ny; add('frames', `grid-h-${j}`, inLeft, inRight, z - bar / 2, z + bar / 2, frameDepth) }
        break
      }
      default:
        // fixed: one pane filling the aperture.
        add('glass', 'pane', start + breadth, end - breadth, bottom + breadth, top - breadth, glassDepth)
    }
  }
  return result
}
