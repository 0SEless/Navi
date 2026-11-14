import { describe, it, expect } from 'vitest'
import { generateStairGraphicsLatLng, generateElevatorGraphicsLatLng } from '../feature-graphics'
import { buildStairGeoJSON } from '@/components/map/layers/StaircaseLayer'
import { buildElevatorGeoJSON } from '@/components/map/layers/ElevatorLayer'
import { buildStairAssetVolumes } from '@navi/core/src/geometry/stair-assets'
import { polygonizeRect } from '../../geometry/polygonize'

describe('stair arrow and solid rise agreement', () => {
  const shapes = [
    { name: 'wide', width: 8, depth: 2, rotation: 0 },
    { name: 'tall', width: 2, depth: 8, rotation: 0 },
    { name: 'square', width: 4, depth: 4, rotation: 0 },
    { name: 'rotated wide', width: 8, depth: 2, rotation: 37 },
  ]
  for (const shape of shapes) {
    for (const clockwise of [false, true]) {
      it(`matches the actual freeform arrow for ${shape.name}, reversed winding=${clockwise}`, () => {
        const points = [{ x: 0, y: 0 }, { x: shape.width, y: 0 }, { x: shape.width, y: shape.depth }, { x: 0, y: shape.depth }]
        if (clockwise) points.reverse()
        assertArrowRise(points, shape.rotation)
      })
    }
    for (const direction of ['north', 'south', 'east', 'west', 'up', 'down']) {
      it(`matches authored ${direction} for ${shape.name}`, () => {
        const polygon = polygonizeRect({ type: 'rect', x: 0, y: 0, width: shape.width, height: shape.depth, rotation: 0 })
        assertArrowRise(polygon.points.slice(0, 4), shape.rotation, direction)
      })
    }
  }

  function assertArrowRise(local: Array<{ x: number; y: number }>, rotation: number, direction?: string) {
    const radians = rotation * Math.PI / 180
    const points = local.map(({ x, y }) => ({ x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) }))
    const input = {
      id: 'stair', position: { x: 0, y: 0 }, rotation, height: 3, polygon: { points },
      ...(direction ? { drawing: { definitionId: 'stair' as const, properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction, preset: 'straight' } } } : {}),
    }
    const before = JSON.stringify(input)
    const { arrow } = generateStairGraphicsLatLng(points.map(p => ({ lng: p.x, lat: p.y })), 8, direction)
    const steps = buildStairAssetVolumes([input]).collection.features
    expect(steps.length).toBeGreaterThan(1)
    const center = (index: number) => {
      const ring = steps[index].geometry.coordinates[0].slice(0, 4)
      return { x: ring.reduce((sum, p) => sum + p[0], 0) / 4, y: ring.reduce((sum, p) => sum + p[1], 0) / 4 }
    }
    const start = center(0), end = center(steps.length - 1)
    const rise = { x: end.x - start.x, y: end.y - start.y }
    const walk = { x: arrow[1].lng - arrow[0].lng, y: arrow[1].lat - arrow[0].lat }
    expect(rise.x * walk.x + rise.y * walk.y).toBeGreaterThan(0)
    expect(rise.x * walk.y - rise.y * walk.x).toBeCloseTo(0, 8)
    if (direction) {
      const x = direction === 'east' ? 1 : direction === 'west' ? -1 : 0
      const y = direction === 'south' || direction === 'up' ? 1 : direction === 'north' || direction === 'down' ? -1 : 0
      const expected = { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) }
      expect(walk.x * expected.x + walk.y * expected.y).toBeGreaterThan(0)
      expect(walk.x * expected.y - walk.y * expected.x).toBeCloseTo(0, 8)
      const publicArrow = buildStairGeoJSON([{
        id: input.id, name: 'Stair', buildingId: 'building', floor: 0,
        position: { lng: 0, lat: 0 }, polygon: points.map(p => ({ lng: p.x, lat: p.y })), drawing: input.drawing,
      }]).features.find(feature => feature.properties?.kind === 'arrow')
      expect(publicArrow?.geometry).toMatchObject({ type: 'LineString', coordinates: generateStairGraphicsLatLng(points.map(p => ({ lng: p.x, lat: p.y })), 4, direction).arrow.map(p => [p.lng, p.lat]) })
    }
    steps.forEach((step, i) => expect(step.properties!.height).toBeCloseTo(3 * (i + 1) / steps.length))
    expect(JSON.stringify(input)).toBe(before)
  }
})


describe('P4 Feature Visual Graphics', () => {
  const quadPoly = [
    { lat: 33.4200, lng: -111.9300 },
    { lat: 33.4200, lng: -111.9280 },
    { lat: 33.4210, lng: -111.9280 },
    { lat: 33.4210, lng: -111.9300 },
  ]

  it('generates parallel stair tread lines and directional walk arrow from polygon', () => {
    const graphics = generateStairGraphicsLatLng(quadPoly, 8)

    expect(graphics.outline).toHaveLength(4)
    expect(graphics.treads).toHaveLength(7) // 8 steps -> 7 interior tread lines
    for (const tread of graphics.treads) {
      expect(tread).toHaveLength(2)
      expect(tread[0].lng).toBeLessThan(tread[1].lng)
    }

    // Directional walk arrow
    expect(graphics.arrow.length).toBeGreaterThanOrEqual(4)
  })

  it('generates elevator shaft, cabin inset box, and door marker double-lines', () => {
    const graphics = generateElevatorGraphicsLatLng(quadPoly, 0.8)

    expect(graphics.shaftOutline).toHaveLength(4)
    expect(graphics.cabinOutline).toHaveLength(5) // 4 vertices + closing vertex
    expect(graphics.doorLines).toHaveLength(2) // 2 door segment markers
  })

  it('buildStairGeoJSON produces rich architectural GeoJSON features for map layers', () => {
    const stairs = [
      {
        id: 'stair-1',
        name: 'Main Stairs',
        buildingId: 'bld-1',
        floor: 0,
        position: { lat: 33.4205, lng: -111.9290 },
        polygon: quadPoly,
      },
    ]

    const geo = buildStairGeoJSON(stairs)
    expect(geo.features.length).toBeGreaterThanOrEqual(3)

    const bodyFeature = geo.features.find((f) => f.properties?.kind === 'body')
    expect(bodyFeature).toBeDefined()
    expect(bodyFeature!.geometry.type).toBe('Polygon')

    const treadFeatures = geo.features.filter((f) => f.properties?.kind === 'tread')
    expect(treadFeatures.length).toBeGreaterThan(0)

    const arrowFeature = geo.features.find((f) => f.properties?.kind === 'arrow')
    expect(arrowFeature).toBeDefined()

    const symbolFeature = geo.features.find((f) => f.properties?.kind === 'symbol')
    expect(symbolFeature).toBeDefined()
  })

  it('buildElevatorGeoJSON produces shaft, cabin, and door GeoJSON features for map layers', () => {
    const elevators = [
      {
        id: 'elev-1',
        name: 'Main Elevator',
        buildingId: 'bld-1',
        floor: 0,
        position: { lat: 33.4205, lng: -111.9290 },
        polygon: quadPoly,
      },
    ]

    const geo = buildElevatorGeoJSON(elevators)
    expect(geo.features.length).toBeGreaterThanOrEqual(3)

    const shaftFeature = geo.features.find((f) => f.properties?.kind === 'shaft')
    expect(shaftFeature).toBeDefined()
    expect(shaftFeature!.geometry.type).toBe('Polygon')

    const cabinFeature = geo.features.find((f) => f.properties?.kind === 'cabin')
    expect(cabinFeature).toBeDefined()

    const doorFeatures = geo.features.filter((f) => f.properties?.kind === 'door')
    expect(doorFeatures).toHaveLength(2)

    const symbolFeature = geo.features.find((f) => f.properties?.kind === 'symbol')
    expect(symbolFeature).toBeDefined()
  })
})
