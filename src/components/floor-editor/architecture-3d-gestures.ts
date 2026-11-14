import type { Opening, Wall } from '@navi/core'
import type { Point3, Ray3 } from './architecture-3d-math'

export interface FacadePosition { offset: number; z: number }
export function isHandleVisible(point: Point3, ray: Ray3 | null, nearest: {distance: number} | null): boolean {
  if (!ray) return false
  const distance = (point.x-ray.origin.x)*ray.direction.x + (point.y-ray.origin.y)*ray.direction.y + (point.z-ray.origin.z)*ray.direction.z
  return Number.isFinite(distance) && distance > 0 && (!nearest || nearest.distance >= distance-.001)
}
export function windowFromDrag(id: string, wall: Wall, a: FacadePosition, b: FacadePosition): Opening {
  return { id, type: 'window', wallId: wall.id, offset: Math.min(a.offset, b.offset), width: Math.abs(b.offset - a.offset), sillHeight: Math.min(a.z, b.z), height: Math.abs(b.z - a.z), windowAppearance: 'fixed' }
}
export function moveWindow(opening: Opening, start: FacadePosition, end: FacadePosition): Opening {
  return { ...opening, offset: opening.offset + end.offset - start.offset, sillHeight: (opening.sillHeight ?? .9) + end.z - start.z }
}
/** Corner order: bottom-left, bottom-right, top-right, top-left. */
export function resizeWindow(opening: Opening, corner: number, p: FacadePosition): Opening {
  const oppositeX = corner === 0 || corner === 3 ? opening.offset + opening.width : opening.offset
  const oppositeZ = corner < 2 ? (opening.sillHeight ?? .9) + (opening.height ?? 1.2) : (opening.sillHeight ?? .9)
  return { ...opening, offset: Math.min(p.offset, oppositeX), sillHeight: Math.min(p.z, oppositeZ), width: Math.abs(p.offset - oppositeX), height: Math.abs(p.z - oppositeZ) }
}
export function openingFits(opening: Opening, wall: Wall, others: readonly Opening[]): string | null {
  const h = opening.height ?? 1.2, z = opening.sillHeight ?? .9
  if (![opening.offset, opening.width, h, z].every(Number.isFinite) || opening.width < .2 || h <= .01 || z < 0 || opening.offset < 0
    || opening.offset + opening.width > Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y) + 1e-8 || z + h > wall.height + 1e-8) return 'Keep the window inside its wall (width at least 0.2 m).'
  if (others.some(other => other.id !== opening.id && other.wallId === wall.id && Math.min(other.offset + other.width, opening.offset + opening.width) - Math.max(other.offset, opening.offset) > 1e-8
    && Math.min((other.sillHeight ?? (other.type === 'door' ? 0 : .9)) + (other.height ?? (other.type === 'door' ? 2.1 : 1.2)), z + h) - Math.max(other.sillHeight ?? (other.type === 'door' ? 0 : .9), z) > 1e-8)) return 'This window overlaps another door or window.'
  return null
}
export function captureStillCurrent(wall: Wall, opening: Opening | undefined, currentWall: Wall | undefined, currentOpening: Opening | undefined): boolean {
  return JSON.stringify(wall) === JSON.stringify(currentWall) && JSON.stringify(opening) === JSON.stringify(currentOpening)
}
