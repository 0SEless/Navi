import type { GroundFit } from '@navi/core'

type LatLng = { lat: number; lng: number }

/** MapLibre's world is 512 px wide at zoom 0. */
const METRES_PER_PIXEL_Z0 = 40075016.686 / 512
export const SIDE_VIEW_PITCH = 75
export const DIG_BLEND_M = 3

/**
 * Metres for a vertical drag of `dyPx` (screen down = positive px = lower), so the object follows the
 * cursor: metres per pixel at the zoom and latitude, divided by the camera's sin(pitch) (a height looks
 * shorter from above). Shift = ten times finer. Rounded to 0.1 m.
 */
export function metresForDrag(dyPx: number, view: { zoom: number; lat: number; pitch: number; fine: boolean }): number {
  const perPixel = (METRES_PER_PIXEL_Z0 * Math.cos((view.lat * Math.PI) / 180)) / 2 ** view.zoom
  const sinPitch = Math.max(0.2, Math.sin((view.pitch * Math.PI) / 180))
  const metres = (-dyPx * perPixel) / sinPitch * (view.fine ? 0.1 : 1)
  return Math.round(metres * 10) / 10 + 0
}

/** Compass direction (degrees, north = 0, east = 90) from a to b. */
function compass(a: LatLng, b: LatLng): number {
  const east = (b.lng - a.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const north = b.lat - a.lat
  return (Math.atan2(east, north) * 180) / Math.PI
}

/**
 * A side view of an object: centred on it, steeply tilted, facing across its longest outline edge
 * (building) or across its run (stair), so heights read in profile. `bounds` frames it.
 */
export function sideViewCamera(points: LatLng[], kind: 'building' | 'stair'): {
  center: LatLng; bearing: number; pitch: number; bounds: [[number, number], [number, number]]
} {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const bounds: [[number, number], [number, number]] = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
  const center = { lat: (bounds[0][1] + bounds[1][1]) / 2, lng: (bounds[0][0] + bounds[1][0]) / 2 }
  let along = 0
  if (kind === 'stair' || points.length < 3) {
    along = compass(points[0], points[points.length - 1])
  } else {
    let longest = -1
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length]
      const east = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180)
      const length = Math.hypot(east, b.lat - a.lat)
      if (length > longest) {
        longest = length
        along = compass(a, b)
      }
    })
  }
  return { center, bearing: (((along + 90) % 360) + 360) % 360, pitch: SIDE_VIEW_PITCH, bounds }
}

/** The floor nearest the current floor's elevation plus the dragged metres (top and bottom floors cap it). */
export function stepFloor(floors: Array<{ id: string; elevation: number }>, currentFloorId: string, deltaM: number): string {
  const current = floors.find((f) => f.id === currentFloorId)
  if (!current || floors.length === 0) return currentFloorId
  const target = current.elevation + deltaM
  return floors.reduce((best, f) => (Math.abs(f.elevation - target) < Math.abs(best.elevation - target) ? f : best), current).id
}

/**
 * A Shift+Z height edit leaves the pad on "lower only" (owner 2026-11-06: the ground is finished, it only
 * digs to a lowered building; a raised one leaves the gap open). Keeps a blend distance already set
 * (including the import's follow-ground "both" default), else 3 m.
 */
export function padAfterLowering(pad: GroundFit | undefined): GroundFit {
  if (!pad || pad.mode === 'off') return { mode: 'lower', blendMeters: DIG_BLEND_M }
  return { mode: 'lower', blendMeters: pad.blendMeters }
}
