import { toLatLng, toLocal } from '../terrain/grid'

type LatLng = { lat: number; lng: number }

const STEP_M = 0.5
const LIFT_M = 0.05

function rgb(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '2563eb'
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255]
}

/**
 * The route as a flat ribbon lying on the campus surface (NAVI Web 3D): sampled every 0.5 m along the
 * path, each sample at `surfaceAt` + 0.05 m, so on stairs and ramps it follows their surface. Local metres
 * around `origin` (the mesh layer's origin), 9 floats per vertex (position, normal, colour).
 */
export function buildRouteRibbon(path: LatLng[], surfaceAt: (p: LatLng) => number, origin: LatLng, widthM = 0.6, color = '#2563eb'): Float32Array {
  if (path.length < 2) return new Float32Array(0)
  const frame = { originLat: origin.lat, originLng: origin.lng }
  const points = path.map((p) => toLocal(frame, p))
  // Samples along the path: every 0.5 m on each segment, plus every corner, each with its side normal.
  const samples: Array<{ x: number; y: number; nx: number; ny: number }> = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 1e-9) continue
    const nx = -(b.y - a.y) / length
    const ny = (b.x - a.x) / length
    const steps = Math.max(1, Math.ceil(length / STEP_M - 1e-6))
    for (let k = samples.length === 0 ? 0 : 1; k <= steps; k++) {
      const t = Math.min(1, (k * STEP_M) / length)
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx, ny })
    }
  }
  const half = widthM / 2
  const [r, g, bl] = rgb(color)
  const out: number[] = []
  const vertex = (x: number, y: number, z: number) => out.push(x, y, z, 0, 0, 1, r, g, bl)
  const heights = samples.map((s) => surfaceAt(toLatLng(frame, { x: s.x, y: s.y })) + LIFT_M)
  for (let i = 1; i < samples.length; i++) {
    const s0 = samples[i - 1]
    const s1 = samples[i]
    const z0 = heights[i - 1]
    const z1 = heights[i]
    const l0 = [s0.x + s0.nx * half, s0.y + s0.ny * half]
    const r0 = [s0.x - s0.nx * half, s0.y - s0.ny * half]
    const l1 = [s1.x + s1.nx * half, s1.y + s1.ny * half]
    const r1 = [s1.x - s1.nx * half, s1.y - s1.ny * half]
    vertex(l0[0], l0[1], z0); vertex(l1[0], l1[1], z1); vertex(r1[0], r1[1], z1)
    vertex(l0[0], l0[1], z0); vertex(r1[0], r1[1], z1); vertex(r0[0], r0[1], z0)
  }
  return new Float32Array(out)
}
