import type { Opening, RoomDoor, Wall } from '../types/entities'
import type { DoorOperation, GlassType, HingeSide, OpeningMaterial, SwingSide } from '../types/enums'
import { resolveDoorStyle } from '../assets/opening-style'
import { GLASS_STYLES, OPENING_MATERIAL_COLORS } from '../assets/opening-catalog'

type StyleSource = { doorOperation?: DoorOperation; hingeSide?: HingeSide; swingSide?: SwingSide; assetPreset?: string; material?: OpeningMaterial; glass?: GlassType }

type DoorAppearance = 'open' | 'solid' | 'glass' | 'double-solid' | 'double-glass'
type DoorPose = 'closed' | 'ajar' | 'open'
/** Structural input also accepts compiled records without editor metadata. */
export type DoorAssetInput = Pick<RoomDoor, 'id' | 'width'> & Partial<Pick<RoomDoor,
  'position' | 'depth' | 'rotation' | 'angle' | 'geometry' | 'wallAttachment'>> & {
  doorType?: string
  doorAppearance?: DoorAppearance
  doorPose?: DoorPose
  doorOperation?: DoorOperation
  hingeSide?: HingeSide
  swingSide?: SwingSide
  assetPreset?: string
  material?: OpeningMaterial
  glass?: GlassType
  openingId?: string
  height?: number
}

export interface DoorAssetVolumes {
  frames: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  panels: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  glass: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  diagnostics: Array<{ entityId: string; code: string; message: string }>
}

export interface DoorAperture {
  id: string
  doorId?: string
  openingId?: string
  wallId?: string
  x: number
  y: number
  ux: number
  uy: number
  width: number
  height: number
  depth: number
  appearance?: DoorAppearance
  pose?: DoorPose
  doorType?: string
  operation?: DoorOperation
  hingeSide?: HingeSide
  swingSide?: SwingSide
  assetPreset?: string
  material?: OpeningMaterial
  glass?: GlassType
}

/** Copy decorative style fields that are explicitly set (canonical door wins over a duplicate opening). */
function copyStyle(target: Aperture, source: StyleSource) {
  if (source.doorOperation !== undefined) target.operation = source.doorOperation
  if (source.hingeSide !== undefined) target.hingeSide = source.hingeSide
  if (source.swingSide !== undefined) target.swingSide = source.swingSide
  if (source.assetPreset !== undefined) target.assetPreset = source.assetPreset
  if (source.material !== undefined) target.material = source.material
  if (source.glass !== undefined) target.glass = source.glass
}

const positive = (value: number) => Number.isFinite(value) && value > 0
const finitePoint = (point: { x: number; y: number } | undefined) => point && Number.isFinite(point.x) && Number.isFinite(point.y)

/** Resolved door apertures (hosted openings, attached and free doors, de-duplicated). Shared by volumes and plan symbols. */
type Aperture = DoorAperture
export function resolveDoorApertures(
  walls: readonly Wall[],
  openings: readonly (Opening & { doorAppearance?: DoorAppearance; doorPose?: DoorPose; doorType?: string })[],
  doors: readonly DoorAssetInput[],
  report: (entityId: string, code: string, message: string) => void = () => {},
): Aperture[] {
  const hosts = new Map(walls.map(wall => [wall.id, wall]))
  const apertures: Aperture[] = []
  function hosted(id: string, wallId: string, start: number, width: number, height: number): Aperture | undefined {
    const wall = hosts.get(wallId)
    if (!wall) {
      report(id, 'DOOR_HOST_MISSING', `Door host "${wallId}" is missing; no substitute host was inferred.`)
      return
    }
    const length = finitePoint(wall.start) && finitePoint(wall.end) ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : NaN
    if (!positive(length) || !positive(wall.height) || !positive(wall.thickness)
      || !positive(width) || !positive(height) || !Number.isFinite(start) || !Number.isFinite(start + width)
      || start < 0 || start + width > length || height > wall.height) {
      report(id, 'DOOR_GEOMETRY_INVALID', 'Door dimensions must be finite, positive and fit entirely within its valid wall aperture.')
      return
    }
    const ux = (wall.end.x - wall.start.x) / length, uy = (wall.end.y - wall.start.y) / length
    return { id, wallId, x: wall.start.x + ux * start, y: wall.start.y + uy * start, ux, uy, width, height, depth: wall.thickness }
  }
  for (const opening of openings) {
    if (opening.type !== 'door') continue
    const aperture = hosted(opening.id, opening.wallId, opening.offset, opening.width, opening.height ?? 2.1)
    if (!aperture) continue
    aperture.openingId = opening.id
    aperture.appearance = opening.doorAppearance
    aperture.pose = opening.doorPose
    copyStyle(aperture, opening)
    apertures.push(aperture)
  }
  for (const door of doors) {
    let aperture: Aperture | undefined
    if (door.wallAttachment !== undefined) {
      if (!door.wallAttachment) {
        report(door.id, 'DOOR_GEOMETRY_INVALID', 'Door attachment must identify a wall, center offset and opening height.')
        continue
      }
      const attachment = door.wallAttachment
      aperture = hosted(door.id, attachment.wallId, attachment.offset - door.width / 2, door.width, attachment.openingHeight)
    } else {
      const geometry = door.geometry
      let x: number, y: number, angle: number, depth: number, width: number
      if (geometry) {
        if (geometry.type !== 'rectangle' || !finitePoint(geometry.min) || !finitePoint(geometry.max)) {
          report(door.id, 'DOOR_GEOMETRY_INVALID', 'Door rectangle requires finite local bounds.')
          continue
        }
        x = (geometry.min.x + geometry.max.x) / 2
        y = (geometry.min.y + geometry.max.y) / 2
        width = geometry.max.x - geometry.min.x
        depth = geometry.max.y - geometry.min.y
        angle = geometry.rotation ?? door.rotation ?? (door.angle === undefined ? 0 : door.angle * Math.PI / 180)
      } else if (finitePoint(door.position) && (door.rotation !== undefined || door.angle !== undefined)) {
        x = door.position!.x
        y = door.position!.y
        angle = door.rotation ?? door.angle! * Math.PI / 180
        width = door.width
        depth = door.depth!
      } else {
        report(door.id, 'DOOR_GEOMETRY_MISSING', 'Door has no resolved local rectangle or oriented dimensions; keep its fallback marker.')
        continue
      }
      const height = door.height ?? 2.1
      if (![x, y, angle].every(Number.isFinite) || !positive(width) || !positive(depth) || !positive(height) || !positive(door.width)) {
        report(door.id, 'DOOR_GEOMETRY_INVALID', 'Door rectangle dimensions and orientation must be finite and positive.')
        continue
      }
      const ux = Math.cos(angle), uy = Math.sin(angle)
      aperture = { id: door.id, x: x - ux * width / 2, y: y - uy * width / 2, ux, uy, width, height, depth }
    }
    if (!aperture) continue
    aperture.doorId = door.id
    aperture.appearance = door.doorType === 'opening' ? 'open' : door.doorAppearance ?? (door.doorType === 'double' ? 'double-solid' : undefined)
    aperture.pose = door.doorPose
    aperture.doorType = door.doorType
    copyStyle(aperture, door)
    const duplicate = apertures.find(other => (door.openingId !== undefined && other.openingId === door.openingId) || other.id === door.id
      || (other.x === aperture.x && other.y === aperture.y && other.ux === aperture.ux && other.uy === aperture.uy
        && other.width === aperture.width && other.height === aperture.height))
    if (duplicate) {
      duplicate.doorId = door.id
      if (duplicate.appearance !== undefined && door.doorAppearance !== undefined && duplicate.appearance !== door.doorAppearance) {
        report(door.id, 'DOOR_APPEARANCE_CONFLICT', 'Duplicate opening and canonical door appearances differ; canonical door appearance rules take precedence, and archways remain open.')
      }
      if (door.doorType === 'opening') duplicate.appearance = 'open'
      else if (door.doorAppearance !== undefined) duplicate.appearance = door.doorAppearance
      else duplicate.appearance ??= aperture.appearance
      if (duplicate.pose !== undefined && door.doorPose !== undefined && duplicate.pose !== door.doorPose) {
        report(door.id, 'DOOR_POSE_CONFLICT', 'Duplicate opening and canonical door poses differ; explicit canonical door pose takes precedence.')
      }
      if (door.doorPose !== undefined) duplicate.pose = door.doorPose
      duplicate.doorType = door.doorType
      copyStyle(duplicate, door)
    } else apertures.push(aperture)
  }

  return apertures
}

/** Decorative building-local volumes only. Opening offsets are leading edges;
 * attached door offsets are centers. `height` properties are absolute tops.
 * Absent pose renders closed and absent appearance renders solid (double-solid
 * for double doors), without modifying source records. A door with
 * an explicit unresolved attachment is never guessed onto a different wall.
 */
export function buildDoorAssetVolumes(
  walls: readonly Wall[],
  openings: readonly (Opening & { doorAppearance?: DoorAppearance; doorPose?: DoorPose; doorType?: string })[],
  doors: readonly DoorAssetInput[],
  base = 0,
): DoorAssetVolumes {
  const result: DoorAssetVolumes = {
    frames: { type: 'FeatureCollection', features: [] },
    panels: { type: 'FeatureCollection', features: [] },
    glass: { type: 'FeatureCollection', features: [] },
    diagnostics: [],
  }
  const report = (entityId: string, code: string, message: string) => result.diagnostics.push({ entityId, code, message })
  if (!Number.isFinite(base)) {
    report('*', 'BASE_INVALID', 'Door presentation base must be finite.')
    return result
  }
  const apertures = resolveDoorApertures(walls, openings, doors, report)

  for (const aperture of apertures) {
    const { id, x, y, ux, uy, width, height, depth } = aperture
    const style = resolveDoorStyle({ doorType: aperture.doorType as RoomDoor['doorType'] | undefined, doorAppearance: aperture.appearance, doorPose: aperture.pose, doorOperation: aperture.operation, hingeSide: aperture.hingeSide, swingSide: aperture.swingSide, assetPreset: aperture.assetPreset, material: aperture.material, glass: aperture.glass })
    const breadth = Math.min(0.055, width / 8, height / 8)
    const frameDepth = depth * 0.8 * (style.fire ? 1.5 : 1)
    const panelDepth = Math.min(0.035, depth / 4, width / 8, height / 8)
    let failed = false
    const pieces: Array<{ kind: 'frames' | 'panels' | 'glass'; feature: GeoJSON.Feature<GeoJSON.Polygon> }> = []
    const angle = aperture.pose === 'open' ? Math.PI / 2 : aperture.pose === 'ajar' ? Math.PI / 6 : 0
    // Non-default style markers only, so unstyled doors keep their exact feature properties.
    const styleProps: Record<string, unknown> = {
      ...(style.fire ? { fire: true } : {}),
      ...(style.operation !== 'hinged' && style.operation !== 'none' ? { operation: style.operation } : {}),
    }
    // Colour only when a preset, material or glass is chosen, so unstyled doors keep their exact properties.
    const chosen = aperture.assetPreset !== undefined || aperture.material !== undefined || aperture.glass !== undefined
    const glassStyle = GLASS_STYLES[style.glass]
    const colorProps = (kind: 'frames' | 'panels' | 'glass'): Record<string, unknown> => !chosen ? {}
      : kind === 'glass' ? { color: glassStyle.color, glassOpacity: glassStyle.opacity }
      : style.material ? { color: OPENING_MATERIAL_COLORS[style.material] } : {}
    function push(kind: 'frames' | 'panels' | 'glass', name: string, ring: number[][], low: number, high: number, thickness: number) {
      const [a, b, c] = ring
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
      if (!(high > low && positive(thickness) && positive(area) && base + high > base + low)
        || ![base + high, base + low, ...ring.flat()].every(Number.isFinite)) {
        failed = true
        return
      }
      const pieceId = `${id}:${kind}:${name}`
      pieces.push({ kind, feature: { type: 'Feature', id: pieceId, properties: {
        id: pieceId, ...(aperture.doorId ? { doorId: aperture.doorId } : {}),
        ...(aperture.openingId ? { openingId: aperture.openingId } : {}),
        ...(aperture.wallId ? { wallId: aperture.wallId } : {}), base: base + low, height: base + high, ...styleProps, ...colorProps(kind),
      }, geometry: { type: 'Polygon', coordinates: [ring] } } })
    }
    const world = (along: number, normal: number) => [x + ux * along - uy * normal, y + uy * along + ux * normal]
    /** A panel of the given length starting at (along, normal), turned by an angle in the floor plane. */
    function addTurned(kind: 'frames' | 'panels' | 'glass', name: string, along: number, normal: number, length: number, turn: number, low: number, high: number, thickness: number) {
      if (!(length > 0)) { failed = true; return }
      const dx = Math.cos(turn), dy = Math.sin(turn), px = -dy * thickness / 2, py = dx * thickness / 2
      const ex = along + dx * length, ey = normal + dy * length
      push(kind, name, [world(along + px, normal + py), world(ex + px, ey + py), world(ex - px, ey - py), world(along - px, normal - py), world(along + px, normal + py)], low, high, thickness)
    }
    function add(kind: 'frames' | 'panels' | 'glass', name: string, left: number, right: number, low: number, high: number, thickness: number, leaf?: { hinge: number; angle: number }, shift = 0) {
      const hinge = leaf?.hinge ?? 0
      const cos = Math.cos(leaf?.angle ?? 0), sin = Math.sin(leaf?.angle ?? 0)
      const point = (along: number, normal: number) => {
        normal += shift
        const a = leaf ? hinge + (along - hinge) * cos - normal * sin : along
        const n = leaf ? (along - hinge) * sin + normal * cos : normal
        return [x + ux * a - uy * n, y + uy * a + ux * n]
      }
      if (!(right > left)) { failed = true; return }
      push(kind, name, [point(left, thickness / 2), point(right, thickness / 2), point(right, -thickness / 2), point(left, -thickness / 2), point(left, thickness / 2)], low, high, thickness)
    }
    add('frames', 'left', 0, breadth, 0, height, frameDepth)
    add('frames', 'right', width - breadth, width, 0, height, frameDepth)
    add('frames', 'header', breadth, width - breadth, height - breadth, height, frameDepth)
    const double = style.leaves === 2
    const glass = style.panel === 'glass'
    const sign = style.swingSide === 'right' ? -1 : 1
    const openness = aperture.pose === 'open' ? 1 : aperture.pose === 'ajar' ? 0.5 : 0
    const top = height - breadth
    if (style.operation === 'folding') {
      // Four narrow panels in a zigzag from the hinge jamb; open folds to about a fifth of the opening.
      const count = 4
      const panel = (width - 2 * breadth) / count
      const fold = openness * Math.acos(0.2)
      const fromEnd = style.hingeSide === 'end'
      let along = fromEnd ? width - breadth : breadth, normal = 0
      for (let i = 0; i < count; i++) {
        const out = sign * (i % 2 === 0 ? 1 : -1) * fold
        const turn = fromEnd ? Math.PI - out : out
        addTurned(glass ? 'glass' : 'panels', `fold-${i + 1}`, along, normal, panel, turn, 0, top, panelDepth)
        along += Math.cos(turn) * panel
        normal += Math.sin(turn) * panel
      }
    } else if (style.operation === 'rolling') {
      // Closed: full slatted shutter. Ajar: shutter rolled up to half height plus its head box. Open: head box only.
      const box = Math.min(0.3, top / 6)
      if (openness < 1) add('panels', 'shutter', breadth, width - breadth, openness * top, top, panelDepth)
      if (openness > 0) add('panels', 'head-box', breadth, width - breadth, top - box, top, Math.max(panelDepth * 4, depth * 0.6))
    } else if (style.operation === 'sliding') {
      // Two panels on offset tracks inside the wall; the moving panel slides over the fixed one.
      // It never rotates and never leaves the opening.
      const inner = width - 2 * breadth
      const panelWidth = Math.min(inner, inner / 2 + 0.05)
      const travel = (aperture.pose === 'open' ? 1 : aperture.pose === 'ajar' ? 0.5 : 0) * (inner - panelWidth)
      const kind = glass ? 'glass' : 'panels'
      add(kind, 'slide-fixed', breadth, breadth + panelWidth, 0, height - breadth, panelDepth, undefined, -panelDepth * 0.75)
      add(kind, 'slide-moving', width - breadth - panelWidth - travel, width - breadth - travel, 0, height - breadth, panelDepth, undefined, panelDepth * 0.75)
    } else if (style.operation !== 'none') {
      const leaves = double
        ? [{ left: breadth, right: width / 2, hinge: breadth, angle: sign * angle, suffix: '-left' },
          { left: width / 2, right: width - breadth, hinge: width - breadth, angle: -sign * angle, suffix: '-right' }]
        : style.hingeSide === 'end'
          ? [{ left: breadth, right: width - breadth, hinge: width - breadth, angle: -sign * angle, suffix: '' }]
          : [{ left: breadth, right: width - breadth, hinge: breadth, angle: sign * angle, suffix: '' }]
      for (const leaf of leaves) {
        const { left, right, suffix } = leaf
        if (style.panel === 'half-glass') {
          // Solid lower half; framed glass pane above.
          const mid = top / 2
          add('panels', `leaf-lower${suffix}`, left, right, 0, mid, panelDepth, leaf)
          add('frames', `leaf-top${suffix}`, left, right, top - breadth, top, panelDepth, leaf)
          add('frames', `leaf-left${suffix}`, left, left + breadth, mid, top - breadth, panelDepth, leaf)
          add('frames', `leaf-right${suffix}`, right - breadth, right, mid, top - breadth, panelDepth, leaf)
          add('glass', `pane${suffix}`, left + breadth, right - breadth, mid, top - breadth, panelDepth / 3, leaf)
        } else if (!glass) add('panels', `leaf${suffix}`, left, right, 0, height - breadth, panelDepth, leaf)
        else {
          // Leaf borders are separate solids; no opaque polygon covers the pane.
          add('frames', `leaf-bottom${suffix}`, left, right, 0, breadth, panelDepth, leaf)
          add('frames', `leaf-top${suffix}`, left, right, height - 2 * breadth, height - breadth, panelDepth, leaf)
          add('frames', `leaf-left${suffix}`, left, left + breadth, breadth, height - 2 * breadth, panelDepth, leaf)
          add('frames', `leaf-right${suffix}`, right - breadth, right, breadth, height - 2 * breadth, panelDepth, leaf)
          add('glass', `pane${suffix}`, left + breadth, right - breadth, breadth, height - 2 * breadth, panelDepth / 3, leaf)
        }
      }
    }
    // A partial frame must not make a precision-collapsed door appear modeled.
    if (failed) report(id, 'DOOR_PRECISION', 'Door solids collapse at the supplied coordinate or elevation datum.')
    else for (const piece of pieces) result[piece.kind].features.push(piece.feature)
  }
  return result
}
