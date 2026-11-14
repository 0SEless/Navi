import { expect, it } from 'vitest'
import { buildWallGeoJSON } from '../WallLayer'

const R = 111320
const metres = (a: number[], b: number[], lat: number) => Math.hypot((b[0] - a[0]) * R * Math.cos(lat * Math.PI / 180), (b[1] - a[1]) * R)

it('draws a 10 m wall 15 cm thick as about 10 m by 15 cm on the map (thickness is metres, not degrees)', () => {
  const lat = 11.7, lng = 122.378, east = 10 / (R * Math.cos(lat * Math.PI / 180))
  const fc = buildWallGeoJSON([{ id: 'w', buildingId: 'b', floor: 0, start: { lat, lng }, end: { lat, lng: lng + east }, thickness: 0.15, height: 3 }] as never)
  const ring = fc.features[0].geometry.coordinates[0] as number[][]
  expect(metres(ring[0], ring[1], lat)).toBeCloseTo(10, 1)
  expect(metres(ring[1], ring[2], lat)).toBeCloseTo(0.15, 2)
})

it('cuts a 1 m door gap 2 m from the start of the wall', () => {
  const lat = 11.7, lng = 122.378, east = 10 / (R * Math.cos(lat * Math.PI / 180))
  const fc = buildWallGeoJSON([{ id: 'w', buildingId: 'b', floor: 0, start: { lat, lng }, end: { lat, lng: lng + east }, thickness: 0.2, height: 3 }] as never,
    [{ id: 'o', buildingId: 'b', floor: 0, type: 'door', wallId: 'w', offset: 2, width: 1 }] as never)
  const first = fc.features[0].geometry.coordinates[0] as number[][]
  expect(fc.features).toHaveLength(2)
  expect(metres(first[0], first[1], lat)).toBeCloseTo(2, 1)
})
