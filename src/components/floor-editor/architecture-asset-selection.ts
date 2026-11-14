import type { Point3, Ray3 } from './architecture-3d-math'

const EPS = 1e-8
const subtract = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Point3, b: Point3): Point3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const length = (p: Point3) => Math.hypot(p.x, p.y, p.z)
const finite = (p: Point3) => p && [p.x, p.y, p.z].every(Number.isFinite)

/** Double-sided triangle hit, with a relative parallel test for thin leaves. */
function triangleDistance(ray: Ray3, a: Point3, b: Point3, c: Point3): number | null {
  const e1 = subtract(b, a), e2 = subtract(c, a), h = cross(ray.direction, e2), det = dot(e1, h)
  const scale = length(e1) * length(h)
  if (!Number.isFinite(det) || !Number.isFinite(scale) || scale === 0 || Math.abs(det) <= EPS * scale) return null
  const s = subtract(ray.origin, a), u = dot(s, h) / det
  if (!Number.isFinite(u) || u < -EPS || u > 1 + EPS) return null
  const q = cross(s, e1), v = dot(ray.direction, q) / det
  if (!Number.isFinite(v) || v < -EPS || u + v > 1 + EPS) return null
  const distance = dot(e2, q) / det
  return Number.isFinite(distance) && distance >= 0 ? distance : null
}

/** Pick generated convex rectangular prisms in building-local meters. Heights
 * are absolute base/top elevations; returned IDs identify authoring entities.
 * Nearest opaque architecture can occlude these decorative assets.
 */
export function pickArchitectureAsset(
  ray: Ray3,
  features: readonly GeoJSON.Feature<GeoJSON.Polygon>[],
  occluderDistance = Infinity,
): { id: string; distance: number } | null {
  if (!finite(ray.origin) || !finite(ray.direction) || Number.isNaN(occluderDistance) || occluderDistance < 0) return null
  const magnitude = length(ray.direction)
  if (!Number.isFinite(magnitude) || magnitude === 0) return null
  // This also preserves meter distances if a caller supplies an unnormalized ray.
  const normalized: Ray3 = { origin: ray.origin, direction: { x: ray.direction.x / magnitude, y: ray.direction.y / magnitude, z: ray.direction.z / magnitude } }
  let closest: { id: string; distance: number } | null = null
  for (const feature of features) {
    const properties = feature.properties
    const id = [properties?.doorId, properties?.openingId, properties?.featureId].find(value => typeof value === 'string' && value.length > 0)
    const low = properties?.base, high = properties?.height
    const rings = feature.geometry?.coordinates, ring = rings?.[0]
    if (typeof id !== 'string' || typeof low !== 'number' || typeof high !== 'number' || !Number.isFinite(low) || !Number.isFinite(high) || high <= low
      || feature.geometry?.type !== 'Polygon' || rings.length !== 1 || !ring || ring.length !== 5
      || ring.some(point => point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
      || ring[0][0] !== ring[4][0] || ring[0][1] !== ring[4][1]) continue
    let sign = 0, valid = true
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4], c = ring[(i + 2) % 4]
      const abx = b[0] - a[0], aby = b[1] - a[1], bcx = c[0] - b[0], bcy = c[1] - b[1]
      const turn = abx * bcy - aby * bcx
      const edgeProduct = Math.hypot(abx, aby) * Math.hypot(bcx, bcy)
      // Require a finite, noncollapsed rectangle, in either winding direction.
      if (!Number.isFinite(turn) || !Number.isFinite(edgeProduct) || edgeProduct === 0 || turn === 0
        || Math.abs(abx * bcx + aby * bcy) > EPS * edgeProduct || (sign !== 0 && Math.sign(turn) !== sign)) {
        valid = false
        break
      }
      sign = Math.sign(turn)
    }
    if (!valid) continue
    const bottom = ring.slice(0, 4).map(([x, y]) => ({ x, y, z: low })), top = bottom.map(point => ({ ...point, z: high }))
    const test = (a: Point3, b: Point3, c: Point3) => {
      const distance = triangleDistance(normalized, a, b, c)
      if (distance !== null && distance <= occluderDistance + 1e-6 && (!closest || distance < closest.distance)) closest = { id, distance }
    }
    for (let i = 1; i < 3; i++) {
      test(bottom[0], bottom[i], bottom[i + 1])
      test(top[0], top[i], top[i + 1])
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      test(bottom[i], bottom[j], top[j])
      test(bottom[i], top[j], top[i])
    }
  }
  return closest
}
