import { describe, expect, it } from 'vitest'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import {
  DISALLOWED_IN_1_5,
  fixtureFull,
  fixtureLarge,
  fixtureLegacyShape,
  fixtureMinimal,
  fixtureWith15Violations,
} from './campus-fixtures'

// Hard-coded key lists copied from packages/core/src/types/document.ts (CampusDocument)
// and packages/core/src/types/entities.ts (Building, Floor). Adding a field to those
// types without updating these lists AND fixtureFull must be a deliberate act.
const CAMPUS_REQUIRED = ['schemaVersion', 'version', 'metadata', 'buildings', 'roads', 'panoramas', 'qrCheckpoints']
const CAMPUS_OPTIONAL = [
  'areas',
  'terrainAreas',
  'terrainVerticalDatum',
  'pois',
  'roadJunctions',
  'separatedCrossings',
  'connectivitySemanticsVersion',
  'boundary',
]
// `_changeJournal` is runtime-only and never serialized: it must NOT be in a fixture.
const CAMPUS_RUNTIME_ONLY = ['_changeJournal']

const BUILDING_REQUIRED = [
  'id', 'name', 'code', 'category', 'description', 'footprint', 'baseElevation', 'height',
  'floors', 'verticalConnectors', 'color', 'aliases', 'metadata',
]
const BUILDING_OPTIONAL = ['department', 'rotation', 'roofHeight', 'staircases', 'elevators', 'verticalTransitions']

const FLOOR_REQUIRED = [
  'id', 'level', 'label', 'elevation', 'height', 'rooms', 'hallways', 'staircases', 'elevators',
  'entrances', 'connectorStops', 'parametricComponents', 'metadata',
]
const FLOOR_OPTIONAL = [
  'shortLabel', 'offset', 'rotation', 'planImageId', 'floorPlanState', 'planAlignment',
  'visible', 'locked', 'walls', 'roomAttributes', 'pois', 'doors', 'windows', 'openings',
  'routeNetwork', 'entranceAccess',
]

function present(obj: object, key: string): boolean {
  return (obj as Record<string, unknown>)[key] !== undefined
}

describe('campus fixtures: field coverage', () => {
  it('every optional field of CampusDocument, Building and Floor is present in fixtureFull', () => {
    const doc = fixtureFull()
    for (const k of [...CAMPUS_REQUIRED, ...CAMPUS_OPTIONAL]) {
      expect(present(doc, k), `CampusDocument.${k}`).toBe(true)
    }
    for (const k of CAMPUS_RUNTIME_ONLY) expect(k in doc, `CampusDocument.${k}`).toBe(false)
    for (const k of [...BUILDING_REQUIRED, ...BUILDING_OPTIONAL]) {
      expect(doc.buildings.some((b) => present(b, k)), `Building.${k}`).toBe(true)
    }
    const floors = doc.buildings.flatMap((b) => b.floors)
    for (const k of [...FLOOR_REQUIRED, ...FLOOR_OPTIONAL]) {
      expect(floors.some((f) => present(f, k)), `Floor.${k}`).toBe(true)
    }
  })

  it('fixtureFull omits the fields NAVI 1.5 forbids in saved data (ruling R2)', () => {
    expect([...DISALLOWED_IN_1_5].sort()).toEqual(['CampusDocument.panoramas (non-empty)', 'Floor.svgOverlayId', 'Floor.textureId'].sort())
    const doc = fixtureFull()
    expect(doc.panoramas).toEqual([])
    for (const f of doc.buildings.flatMap((b) => b.floors)) {
      expect('textureId' in f).toBe(false)
      expect('svgOverlayId' in f).toBe(false)
    }
    expect(JSON.stringify(doc)).not.toContain('data:image')
  })

  it('exercises hostile ids and non-ASCII names', () => {
    const doc = fixtureFull()
    expect(doc.buildings.some((b) => b.id.includes(':'))).toBe(true)
    expect(doc.buildings.some((b) => b.id.includes('/'))).toBe(true)
    expect(doc.buildings.flatMap((b) => b.floors).some((f) => f.id.includes('/'))).toBe(true)
    expect(doc.buildings.some((b) => b.name.includes('Ñoño') && b.name.includes('\u{1F600}'))).toBe(true)
  })

  it('fixtureFull includes the structures the brief names', () => {
    const doc = fixtureFull()
    const features = new Set(doc.roads.map((r) => r.routing?.feature))
    for (const f of ['stairs', 'ramp', 'bridge']) expect(features.has(f as never), f).toBe(true)
    expect(doc.roads.some((r) => r.routing?.slope !== undefined)).toBe(true)
  })

  it('fixtureWith15Violations adds exactly the forbidden content on top of fixtureFull', () => {
    const bad = fixtureWith15Violations()
    expect(bad.panoramas.length).toBeGreaterThan(0)
    const floors = bad.buildings.flatMap((b) => b.floors)
    expect(floors.some((f) => typeof f.textureId === 'string')).toBe(true)
    expect(floors.some((f) => typeof f.svgOverlayId === 'string')).toBe(true)
    expect(JSON.stringify(bad)).toContain('data:image/png;base64,AAA')
  })
})

describe('campus fixtures: shapes', () => {
  it('fixtureMinimal has one building, one floor and no optional fields', () => {
    const doc = fixtureMinimal()
    expect(doc.buildings).toHaveLength(1)
    expect(doc.buildings[0].floors).toHaveLength(1)
    for (const k of CAMPUS_OPTIONAL) expect(k in doc, `CampusDocument.${k}`).toBe(false)
    for (const k of BUILDING_OPTIONAL) expect(k in doc.buildings[0], `Building.${k}`).toBe(false)
    for (const k of FLOOR_OPTIONAL) expect(k in doc.buildings[0].floors[0], `Floor.${k}`).toBe(false)
  })

  it('fixtureLegacyShape has the optional arrays absent, not empty', () => {
    const doc = fixtureLegacyShape()
    for (const k of ['areas', 'terrainAreas', 'pois', 'roadJunctions', 'separatedCrossings']) {
      expect(k in doc, `CampusDocument.${k}`).toBe(false)
    }
    for (const f of doc.buildings.flatMap((b) => b.floors)) {
      for (const k of ['walls', 'openings', 'pois', 'doors', 'windows', 'roomAttributes', 'routeNetwork', 'entranceAccess']) {
        expect(k in f, `Floor.${k}`).toBe(false)
      }
    }
    for (const b of doc.buildings) {
      for (const k of ['staircases', 'elevators', 'verticalTransitions']) expect(k in b, `Building.${k}`).toBe(false)
    }
  })

  it('returns fresh objects on every call', () => {
    for (const make of [fixtureMinimal, fixtureFull, fixtureLegacyShape]) {
      const a = make()
      const b = make()
      expect(a).not.toBe(b)
      expect(a.buildings).not.toBe(b.buildings)
      expect(a.buildings[0].floors[0]).not.toBe(b.buildings[0].floors[0])
      expect(a.buildings[0].floors[0].rooms).not.toBe(b.buildings[0].floors[0].rooms)
      expect(a.metadata).not.toBe(b.metadata)
    }
  })

  it('is deterministic across calls', () => {
    expect(JSON.stringify(fixtureFull())).toBe(JSON.stringify(fixtureFull()))
    expect(JSON.stringify(fixtureMinimal())).toBe(JSON.stringify(fixtureMinimal()))
  })

  it('fixtureLarge reaches the target size quickly and deterministically', () => {
    const t0 = performance.now()
    const doc = fixtureLarge()
    const json = JSON.stringify(doc)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(json.length).toBeGreaterThanOrEqual(3_000_000)
    expect(json).toBe(JSON.stringify(fixtureLarge()))
    expect(JSON.stringify(fixtureLarge(100_000)).length).toBeGreaterThanOrEqual(100_000)
  })
})

describe('campus fixtures: compiler sanity', () => {
  const compile = (doc: CampusDocument) => new CampusCompiler().compileV2(doc)

  it.each([
    ['fixtureMinimal', fixtureMinimal],
    ['fixtureFull', fixtureFull],
    ['fixtureLegacyShape', fixtureLegacyShape],
  ])('compileV2(%s()) succeeds', (_name, make) => {
    const result = compile(make())
    expect(result.errors).toEqual([])
    expect(result.success).toBe(true)
  })
})
