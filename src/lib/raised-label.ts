/**
 * MapLibre draws labels on the ground. A label for a room on a raised floor (1F, 2F in the 2.5D view) is
 * placed instead where the camera's line of sight through the raised point reaches the ground, so on screen
 * it sits exactly over the raised room. Any one frame of units works (MapLibre mercator here).
 */
type P3 = { x: number; y: number; z: number }

export function groundPointUnder(camera: P3, point: P3, groundZ: number): { x: number; y: number } | null {
  if (point.z <= groundZ) return { x: point.x, y: point.y }
  if (camera.z <= point.z) return null
  const t = (camera.z - groundZ) / (camera.z - point.z)
  return { x: camera.x + t * (point.x - camera.x), y: camera.y + t * (point.y - camera.y) }
}
