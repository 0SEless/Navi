import { describe, expect, it } from 'vitest'
import type { CampusDocument, QRCheckpoint } from '@navi/core'
import {
  fixtureFull,
  fixtureLarge,
  fixtureLegacyShape,
  fixtureMinimal,
  fixtureWith15Violations,
  fixtureTerrain,
} from '../__fixtures__/campus-fixtures'
import { canonicalJson, fastHash } from './canonical'
import { partKey } from './part-keys'
import { joinParts } from './join'
import { UnknownFieldError, partHashes, splitDocument, type PartRecord } from './split'

const LOCAL_ONLY_FLOOR_FIELDS = ['planImageId', 'planAlignment', 'floorPlanState'] as const

/** Deep copy without the fields the lossless comparison excludes (ruling R3). */
function stripVolatile(doc: CampusDocument, opts: { keepLocal?: boolean; keepMetadata?: boolean } = {}): unknown {
  const copy = structuredClone(doc) as unknown as Record<string, any>
  delete copy.version
  delete copy._changeJournal
  if (!opts.keepMetadata) {
    delete copy.metadata.lastModified
    delete copy.metadata.editorVersion
  }
  if (!opts.keepLocal) {
    for (const building of copy.buildings) {
      for (const floor of building.floors) {
        for (const field of LOCAL_ONLY_FLOOR_FIELDS) delete floor[field]
      }
    }
  }
  return copy
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

function findPart(parts: PartRecord[], key: string): PartRecord {
  const part = parts.find((p) => p.key === key)
  if (!part) throw new Error(`part ${key} not found; have ${parts.map((p) => p.key).join(', ')}`)
  return part
}

const FIXTURES: Array<[string, () => CampusDocument]> = [
  ['minimal', fixtureMinimal],
  ['full', fixtureFull],
  ['legacyShape', fixtureLegacyShape],
  ['large', () => fixtureLarge()],
  ['with15Violations', fixtureWith15Violations],
]

describe('splitDocument / joinParts round trip', () => {
  for (const [name, make] of FIXTURES) {
    it(`join(split(doc)) deep-equals doc minus version/_changeJournal/local-only (${name})`, () => {
      const doc = make()
      const { parts } = splitDocument(doc)
      const joined = joinParts(parts)
      expect(stripVolatile(joined)).toEqual(stripVolatile(doc))
      expect(canonicalJson(stripVolatile(joined))).toBe(canonicalJson(stripVolatile(doc)))
    })
  }

  it('join(parts, localReferences, opts) restores planImageId/planAlignment/floorPlanState and metadata', () => {
    const doc = fixtureFull()
    const { parts, localReferences } = splitDocument(doc)
    const joined = joinParts(parts, localReferences, {
      lastModified: doc.metadata.lastModified,
      editorVersion: doc.metadata.editorVersion,
    })
    expect(stripVolatile(joined, { keepLocal: true, keepMetadata: true })).toEqual(
      stripVolatile(doc, { keepLocal: true, keepMetadata: true }),
    )
    const ground = joined.buildings[0].floors[0]
    expect(ground.planImageId).toBe('asset:plan-ground')
    expect(ground.floorPlanState).toBe('locked')
    expect(ground.planAlignment).toEqual(doc.buildings[0].floors[0].planAlignment)
    expect(joined.buildings[0].floors[1].planAlignment).toEqual({})
  })

  it('join defaults lastModified/editorVersion and sets version 0', () => {
    const joined = joinParts(splitDocument(fixtureFull()).parts)
    expect(joined.version).toBe(0)
    expect(joined.metadata.lastModified).toBe('1970-01-01T00:00:00.000Z')
    expect(joined.metadata.editorVersion).toBe('')
    expect('_changeJournal' in joined).toBe(false)
  })

  it('absent optional collections stay absent; [] stays [] (legacy shape)', () => {
    const legacy = fixtureLegacyShape()
    const joinedLegacy = joinParts(splitDocument(legacy).parts) as unknown as Record<string, unknown>
    for (const key of ['areas', 'pois', 'roadJunctions', 'separatedCrossings', 'terrainAreas', 'terrainVerticalDatum', 'boundary', 'connectivitySemanticsVersion']) {
      expect(key in joinedLegacy, key).toBe(false)
    }
    expect(joinedLegacy.roads).toHaveLength(1)
    expect(joinedLegacy.panoramas).toEqual([])
    expect(joinedLegacy.qrCheckpoints).toEqual([])

    const withEmpty = fixtureLegacyShape()
    withEmpty.areas = []
    withEmpty.pois = []
    withEmpty.roadJunctions = []
    withEmpty.separatedCrossings = []
    withEmpty.terrainAreas = []
    const joinedEmpty = joinParts(splitDocument(withEmpty).parts)
    expect(joinedEmpty.areas).toEqual([])
    expect(joinedEmpty.pois).toEqual([])
    expect(joinedEmpty.roadJunctions).toEqual([])
    expect(joinedEmpty.separatedCrossings).toEqual([])
    expect(joinedEmpty.terrainAreas).toEqual([])
  })

  it('roads absent in parts is still emitted as an array', () => {
    const doc = fixtureLegacyShape()
    doc.roads = []
    const joined = joinParts(splitDocument(doc).parts)
    expect(joined.roads).toEqual([])
  })
})

describe('splitDocument mapping', () => {
  it('local-only floor fields appear only in localReferences', () => {
    const doc = fixtureFull()
    const { parts, localReferences } = splitDocument(doc)
    for (const part of parts) {
      const text = JSON.stringify(part.content)
      expect(text).not.toContain('planImageId')
      expect(text).not.toContain('planAlignment')
      expect(text).not.toContain('floorPlanState')
      expect(text).not.toContain('asset:plan-ground')
    }
    expect(localReferences).toEqual([
      {
        buildingId: 'osm:way/123',
        floorId: 'bib/ground',
        planImageId: 'asset:plan-ground',
        floorPlanState: 'locked',
        planAlignment: doc.buildings[0].floors[0].planAlignment,
      },
      { buildingId: 'osm:way/123', floorId: 'bib/upper', planImageId: 'asset:plan-upper', floorPlanState: 'active', planAlignment: {} },
    ])
  })

  it('emits no LocalFloorReference for floors without local-only fields', () => {
    expect(splitDocument(fixtureMinimal()).localReferences).toEqual([])
  })

  it('emits the exact campus, building, floor and terrain part shapes', () => {
    const doc = fixtureFull()
    const { parts } = splitDocument(doc)
    const campus = findPart(parts, partKey('campus')).content as Record<string, unknown>
    expect(campus).toEqual({
      schemaVersion: 1,
      metadata: { campusId: 'asu-ibajay', name: 'ASU Ibajay', description: 'Aklan State University, Ibajay campus (test fixture)' },
      presentCollections: ['areas', 'pois', 'roadJunctions', 'separatedCrossings'],
      boundary: doc.boundary,
      connectivitySemanticsVersion: '1.0.0',
      panoramas: [],
    })
    expect('orphanQrCheckpoints' in campus).toBe(false)
    expect('orphanQrSortKeys' in campus).toBe(false)

    const building = findPart(parts, partKey('building', 'osm:way/123')).content as Record<string, any>
    expect(Object.keys(building).sort()).toEqual(['building', 'floorOrder', 'qrCheckpoints', 'qrSortKeys'])
    expect('floors' in building.building).toBe(false)
    expect(building.building.name).toBe(doc.buildings[0].name)
    expect(building.floorOrder).toEqual(['bib/ground', 'bib/upper'])

    const floor = findPart(parts, partKey('floor', 'osm:way/123', 'bib/ground')).content as Record<string, unknown>
    const expectedFloor = structuredClone(doc.buildings[0].floors[0]) as unknown as Record<string, unknown>
    for (const field of LOCAL_ONLY_FLOOR_FIELDS) delete expectedFloor[field]
    expect(floor).toEqual(expectedFloor)

    expect(findPart(parts, partKey('terrain')).content).toEqual({
      terrainAreas: doc.terrainAreas,
      terrainVerticalDatum: doc.terrainVerticalDatum,
    })
    const legacyTerrain = findPart(splitDocument(fixtureLegacyShape()).parts, partKey('terrain')).content
    expect(legacyTerrain).toEqual({})
    expect(Object.keys(legacyTerrain as object)).toEqual([])

    for (const part of parts) {
      if (part.key.startsWith('map/') || part.key.startsWith('building:')) continue // R42: buildings carry an order sortKey
      expect(part.sortKey, part.key).toBeNull()
    }
  })

  it('emits one part per map item with the right kind, and the item as content', () => {
    const doc = fixtureFull()
    const { parts } = splitDocument(doc)
    expect(findPart(parts, partKey('map/road', 'road-main')).content).toEqual(doc.roads[0])
    expect(findPart(parts, partKey('map/junction', 'rj-3')).content).toEqual(doc.roadJunctions![2])
    expect(findPart(parts, partKey('map/crossing', 'sc-1')).content).toEqual(doc.separatedCrossings![0])
    expect(findPart(parts, partKey('map/area', 'area-1')).content).toEqual(doc.areas![0])
    expect(findPart(parts, partKey('map/poi', 'opoi-4')).content).toEqual(doc.pois![3])
    const mapParts = parts.filter((p) => p.key.startsWith('map/'))
    expect(mapParts).toHaveLength(5 + 4 + 1 + 1 + 4)
  })

  it('stores map sortKey on the PartRecord (zero-padded index), not inside content', () => {
    const { parts } = splitDocument(fixtureFull())
    const road = findPart(parts, partKey('map/road', 'road-bridge'))
    expect(road.sortKey).toBe('000003')
    expect(JSON.stringify(road.content)).not.toContain('sortKey')
    expect(findPart(parts, partKey('map/poi', 'opoi-1')).sortKey).toBe('000000')
  })

  it('map item hash does not depend on its position in the collection', () => {
    const doc = fixtureFull()
    const reordered = fixtureFull()
    reordered.roads.reverse()
    const a = partHashes(splitDocument(doc).parts)
    const b = partHashes(splitDocument(reordered).parts)
    const key = partKey('map/road', 'road-main')
    expect(a.get(key)).toBe(b.get(key))
    expect(findPart(splitDocument(reordered).parts, key).sortKey).toBe('000004')
  })

  it('join orders map items by sortKey even when parts arrive shuffled', () => {
    const doc = fixtureFull()
    const { parts } = splitDocument(doc)
    const shuffled = [...parts].reverse()
    expect(stripVolatile(joinParts(shuffled))).toEqual(stripVolatile(doc))
    expect(joinParts(shuffled).roads.map((r) => r.id)).toEqual(doc.roads.map((r) => r.id))
  })

  it('QR checkpoint lands in building:<its buildingId>', () => {
    const { parts } = splitDocument(fixtureFull())
    const lib = findPart(parts, partKey('building', 'osm:way/123')).content as Record<string, any>
    const sci = findPart(parts, partKey('building', 'bld-sci')).content as Record<string, any>
    expect(lib.qrCheckpoints.map((q: QRCheckpoint) => q.id)).toEqual(['qr-1'])
    expect(lib.qrSortKeys).toEqual(['000000'])
    expect(sci.qrCheckpoints.map((q: QRCheckpoint) => q.id)).toEqual(['qr-2'])
    expect(sci.qrSortKeys).toEqual(['000001'])
  })

  it('orphan QR checkpoint goes into the campus part and keeps its original position', () => {
    const doc = fixtureFull()
    const orphan: QRCheckpoint = { id: 'qr-orphan', label: 'Gone', position: { x: 0, y: 0 }, floor: 0, buildingId: 'bld-demolished', code: 'NAVI-QR-9999', metadata: {} }
    const extraLib: QRCheckpoint = { ...doc.qrCheckpoints[0], id: 'qr-3', code: 'NAVI-QR-0003', metadata: {} }
    // Interleave buildings and the orphan so join must merge by sortKey.
    doc.qrCheckpoints = [doc.qrCheckpoints[1], orphan, doc.qrCheckpoints[0], extraLib]
    const { parts } = splitDocument(doc)
    const campus = findPart(parts, partKey('campus')).content as Record<string, unknown>
    expect(campus.orphanQrCheckpoints).toEqual([orphan])
    expect(campus.orphanQrSortKeys).toEqual(['000001'])
    const lib = findPart(parts, partKey('building', 'osm:way/123')).content as Record<string, any>
    expect(lib.qrSortKeys).toEqual(['000002', '000003'])
    const joined = joinParts(parts)
    expect(joined.qrCheckpoints.map((q) => q.id)).toEqual(['qr-2', 'qr-orphan', 'qr-1', 'qr-3'])
    expect(stripVolatile(joined)).toEqual(stripVolatile(doc))
  })

  it('unknown top-level field throws UnknownFieldError with path mysteryField', () => {
    const doc = fixtureFull() as CampusDocument & { mysteryField?: unknown }
    doc.mysteryField = { anything: 1 }
    let caught: unknown
    try {
      splitDocument(doc)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(UnknownFieldError)
    expect((caught as UnknownFieldError).path).toBe('mysteryField')
  })

  it('unknown Floor and Building fields are carried inside their parts', () => {
    const doc = fixtureFull()
    ;(doc.buildings[1].floors[0] as unknown as Record<string, unknown>).futureFloorField = { keep: ['me'] }
    ;(doc.buildings[1] as unknown as Record<string, unknown>).futureBuildingField = 7
    ;(doc.metadata as unknown as Record<string, unknown>).futureMetaField = 'm'
    const { parts } = splitDocument(doc)
    expect((findPart(parts, partKey('floor', 'bld-sci', 'sci-f1')).content as Record<string, unknown>).futureFloorField).toEqual({ keep: ['me'] })
    expect((findPart(parts, partKey('building', 'bld-sci')).content as Record<string, any>).building.futureBuildingField).toBe(7)
    expect(stripVolatile(joinParts(parts))).toEqual(stripVolatile(doc))
  })

  it('carries non-empty panoramas exactly (rejection is a later task)', () => {
    const doc = fixtureWith15Violations()
    const campus = findPart(splitDocument(doc).parts, partKey('campus')).content as Record<string, unknown>
    expect(campus.panoramas).toEqual(doc.panoramas)
  })

  it('omits panoramas from the campus part when the document has none', () => {
    const doc = fixtureMinimal() as unknown as Record<string, unknown>
    delete doc.panoramas
    const { parts } = splitDocument(doc as unknown as CampusDocument)
    expect('panoramas' in (findPart(parts, partKey('campus')).content as object)).toBe(false)
    expect('panoramas' in joinParts(parts)).toBe(false)
  })
})

describe('splitDocument identity guards', () => {
  it('throws on duplicate building ids', () => {
    const doc = fixtureFull()
    doc.buildings[1].id = doc.buildings[0].id
    expect(() => splitDocument(doc)).toThrow(/duplicate building id/i)
  })

  it('throws on duplicate floor ids within a building', () => {
    const doc = fixtureFull()
    doc.buildings[0].floors[1].id = doc.buildings[0].floors[0].id
    expect(() => splitDocument(doc)).toThrow(/duplicate floor id/i)
  })

  it('allows the same floor id in two different buildings', () => {
    const doc = fixtureFull()
    doc.buildings[1].floors[0].id = doc.buildings[0].floors[0].id
    const { parts } = splitDocument(doc)
    expect(stripVolatile(joinParts(parts))).toEqual(stripVolatile(doc))
  })

  it('throws on duplicate ids within one map collection', () => {
    const doc = fixtureFull()
    doc.roads[1].id = doc.roads[0].id
    expect(() => splitDocument(doc)).toThrow(/duplicate .*roads/i)
  })

  it('throws on missing or blank ids', () => {
    const blankBuilding = fixtureFull()
    blankBuilding.buildings[0].id = '  '
    expect(() => splitDocument(blankBuilding)).toThrow(/building/i)
    const missingFloor = fixtureFull()
    delete (missingFloor.buildings[0].floors[0] as unknown as Record<string, unknown>).id
    expect(() => splitDocument(missingFloor)).toThrow(/floor/i)
    const blankPoi = fixtureFull()
    blankPoi.pois![0].id = ''
    expect(() => splitDocument(blankPoi)).toThrow(/pois/i)
  })
})

describe('splitDocument purity', () => {
  it('does not mutate the input document (deep-frozen)', () => {
    const doc = deepFreeze(fixtureFull())
    const before = JSON.stringify(doc)
    const { parts } = splitDocument(doc)
    expect(JSON.stringify(doc)).toBe(before)
    expect(parts.length).toBeGreaterThan(0)
  })

  it('part contents and local references do not alias the input', () => {
    const doc = fixtureFull()
    const snapshot = structuredClone(doc)
    const { parts, localReferences } = splitDocument(doc)
    const floor = findPart(parts, partKey('floor', 'osm:way/123', 'bib/ground')).content as Record<string, any>
    floor.rooms[0].name = 'MUTATED'
    const road = findPart(parts, partKey('map/road', 'road-main')).content as Record<string, any>
    road.polyline.points[0].lat = 0
    const campus = findPart(parts, partKey('campus')).content as Record<string, any>
    campus.boundary.points.length = 0
    campus.metadata.name = 'MUTATED'
    const lib = findPart(parts, partKey('building', 'osm:way/123')).content as Record<string, any>
    lib.building.metadata.nested.a = 99
    lib.qrCheckpoints[0].metadata.printed = 'MUTATED'
    ;(localReferences[0].planAlignment as Record<string, unknown>).scale = 0
    expect(doc).toEqual(snapshot)
  })

  it('keeps a JSON-parsed "__proto__" key as data through split and join', () => {
    const doc = fixtureMinimal()
    ;(doc.buildings[0] as unknown as Record<string, unknown>).metadata = JSON.parse('{"__proto__":{"polluted":true},"ok":1}')
    const { parts } = splitDocument(doc)
    const building = (findPart(parts, partKey('building', 'bld-min')).content as Record<string, any>).building
    expect(Object.getPrototypeOf(building.metadata)).toBe(Object.prototype)
    expect(Object.keys(building.metadata)).toEqual(['__proto__', 'ok'])
    const joined = joinParts(parts)
    expect(JSON.stringify(joined.buildings[0].metadata)).toBe('{"__proto__":{"polluted":true},"ok":1}')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('the joined document does not alias the parts', () => {
    const { parts, localReferences } = splitDocument(fixtureFull())
    const hashesBefore = partHashes(parts)
    const localBefore = structuredClone(localReferences)
    const joined = joinParts(parts, localReferences)
    joined.buildings[0].floors[0].rooms[0].name = 'MUTATED'
    joined.buildings[0].metadata.yearBuilt = 0
    joined.roads[0].width = 0
    joined.qrCheckpoints[0].label = 'MUTATED'
    joined.boundary!.points.length = 0
    joined.terrainAreas![0].name = 'MUTATED'
    ;(joined.buildings[0].floors[0].planAlignment as unknown as Record<string, unknown>).scale = 0
    expect(partHashes(parts)).toEqual(hashesBefore)
    expect(localReferences).toEqual(localBefore)
  })
})

describe('building order (R42)', () => {
  it('building order travels on the building parts sortKey, not in the campus part', () => {
    const { parts } = splitDocument(fixtureFull())
    expect('buildingOrder' in (findPart(parts, partKey('campus')).content as Record<string, unknown>)).toBe(false)
    expect(findPart(parts, partKey('building', 'osm:way/123')).sortKey).toBe('000000')
    expect(findPart(parts, partKey('building', 'bld-sci')).sortKey).toBe('000001')
  })

  it('adding a building changes only its own parts, never the campus part', () => {
    const doc = fixtureFull()
    const before = partHashes(splitDocument(doc).parts)
    const copy = structuredClone(doc.buildings[1])
    copy.id = 'bld-new'
    doc.buildings.push(copy)
    const after = partHashes(splitDocument(doc).parts)
    const changed = [...after.keys()].filter((key) => before.get(key) !== after.get(key)).sort()
    expect(changed).toEqual([partKey('building', 'bld-new'), ...copy.floors.map((floor) => partKey('floor', 'bld-new', floor.id))].sort())
  })

  it('join restores building order from the sortKeys even when parts arrive shuffled', () => {
    const doc = fixtureFull()
    const { parts, localReferences } = splitDocument(doc)
    const joined = joinParts([...parts].reverse(), localReferences)
    expect(joined.buildings.map((building) => building.id)).toEqual(doc.buildings.map((building) => building.id))
  })
})

describe('partHashes', () => {
  it('is fastHash(canonicalJson(content)) keyed by part key', () => {
    const { parts } = splitDocument(fixtureFull())
    const hashes = partHashes(parts)
    expect(hashes.size).toBe(parts.length)
    for (const part of parts) expect(hashes.get(part.key)).toBe(fastHash(canonicalJson(part.content)))
  })

  it('is deterministic across fresh splits of equal documents', () => {
    expect(partHashes(splitDocument(fixtureFull()).parts)).toEqual(partHashes(splitDocument(fixtureFull()).parts))
  })

  it('split+partHashes of fixtureLarge < 200 ms', () => {
    const doc = fixtureLarge()
    partHashes(splitDocument(doc).parts) // warm up
    const start = performance.now()
    partHashes(splitDocument(doc).parts)
    const elapsed = performance.now() - start
    console.log(`[save-v2] split+partHashes fixtureLarge (${JSON.stringify(doc).length} bytes): ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('terrain plan parts', () => {
  it('split/join round-trip leaves a terrain-free document unchanged', () => {
    const doc = fixtureFull()
    const { parts } = splitDocument(doc)
    expect(parts.some((p) => p.key.startsWith('terrain-tile:') || p.key.startsWith('map/structure'))).toBe(false)
    expect((parts.find((p) => p.key === 'terrain')!.content as Record<string, unknown>).terrain).toBeUndefined()
    const joined = joinParts(parts) as unknown as Record<string, unknown>
    for (const field of ['terrain', 'terrainTiles', 'structures', 'structurePresets']) expect(field in joined).toBe(false)
    expect(stripVolatile(joined as unknown as CampusDocument)).toEqual(stripVolatile(doc))
  })

  it('terrain tiles split into terrain-tile binary parts and join back', () => {
    const doc = fixtureTerrain()
    const { parts } = splitDocument(doc)
    const tiles = parts.filter((p) => p.key.startsWith('terrain-tile:'))
    expect(tiles.map((p) => p.key).sort()).toEqual(['terrain-tile:-1_0', 'terrain-tile:0_0'])
    for (const tile of tiles) {
      expect(tile.content).toBeNull()
      expect(tile.contentBase64).toBe(doc.terrainTiles![tile.key.slice('terrain-tile:'.length) as '0_0'])
    }
    expect((parts.find((p) => p.key === 'terrain')!.content as Record<string, unknown>).terrain).toEqual(doc.terrain)
    const joined = joinParts(parts)
    expect(joined.terrainTiles).toEqual(doc.terrainTiles)
    expect(joined.terrain).toEqual(doc.terrain)
  })

  it('structures and presets round-trip in authored order', () => {
    const doc = fixtureTerrain()
    const { parts } = splitDocument(doc)
    expect(parts.filter((p) => p.key.startsWith('map/structure:')).map((p) => p.key)).toEqual(['map/structure:stair-1', 'map/structure:stair-0'])
    expect(parts.some((p) => p.key === 'map/structure-preset:preset-plain-stair')).toBe(true)
    const joined = joinParts(parts)
    expect(joined.structures!.map((s) => s.id)).toEqual(['stair-1', 'stair-0'])
    expect(joined.structurePresets).toEqual(doc.structurePresets)
    expect(stripVolatile(joined)).toEqual(stripVolatile(doc))
  })
})

describe('door/window asset style fields (2026-11-13)', () => {
  it('round-trips a floor whose door and opening carry hingeSide end, swingSide right, doorOperation sliding', () => {
    const doc = fixtureFull()
    const floor = doc.buildings[0].floors[0] as unknown as Record<string, any>
    floor.doors = [...(floor.doors ?? []), { id: 'style-door', doorType: 'standard', position: { x: 1, y: 1 }, width: 1, metadata: {}, hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' }]
    floor.openings = [...(floor.openings ?? []), { id: 'style-opening', type: 'door', wallId: 'w-any', offset: 0, width: 1, hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' }]
    const joined = joinParts(splitDocument(doc).parts)
    expect(stripVolatile(joined)).toEqual(stripVolatile(doc))
    const jf = joined.buildings[0].floors[0] as unknown as Record<string, any>
    expect(jf.doors.find((d: any) => d.id === 'style-door')).toMatchObject({ hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' })
    expect(jf.openings.find((o: any) => o.id === 'style-opening')).toMatchObject({ hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' })
  })
  it('round-trips window jalousie/casement fields', () => {
    const doc = fixtureFull()
    const floor = doc.buildings[0].floors[0] as unknown as Record<string, any>
    floor.openings = [...(floor.openings ?? []), { id: 'style-window', type: 'window', wallId: 'w-any', offset: 0, width: 1.2, windowAppearance: 'casement', windowPose: 'open', assetPreset: 'window.casement', material: 'aluminium', glass: 'tinted' }]
    const joined = joinParts(splitDocument(doc).parts)
    expect(stripVolatile(joined)).toEqual(stripVolatile(doc))
    expect((joined.buildings[0].floors[0] as any).openings.find((o: any) => o.id === 'style-window')).toMatchObject({ windowAppearance: 'casement', windowPose: 'open', assetPreset: 'window.casement' })
  })
})
