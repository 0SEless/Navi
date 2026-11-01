import { describe, expect, it } from 'vitest'
import { fixtureFull, fixtureLarge, fixtureWith15Violations } from '../__fixtures__/campus-fixtures'
import { canonicalJson } from './canonical'
import { STUDIO_PART_MAX_BYTES, checkPart, checkSettings, type PartIssue } from './content-rules'
import { partKey } from './part-keys'
import { splitDocument, type PartRecord } from './split'

function floorRecord(overrides: Record<string, unknown> = {}, floorId = 'f1', keyFloorId = floorId): PartRecord {
  return {
    key: partKey('floor', 'b1', keyFloorId),
    sortKey: null,
    content: {
      id: floorId,
      rooms: [],
      hallways: [],
      staircases: [],
      elevators: [],
      entrances: [],
      connectorStops: [],
      parametricComponents: [],
      metadata: {},
      ...overrides,
    },
  }
}

const codes = (issues: PartIssue[]) => issues.map((i) => i.code)
const poi = (content: unknown): PartRecord => ({ key: 'map/poi:p1', sortKey: '000000', content })

describe('checkPart: NAVI 1.5 content rules', () => {
  it('flags non-empty campus panoramas', () => {
    const issues = checkPart({
      key: 'campus',
      sortKey: null,
      content: { schemaVersion: '1', metadata: {}, buildingOrder: [], presentCollections: [], panoramas: [{ id: 'p' }] },
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ key: 'campus', code: 'NOT_ALLOWED_IN_1_5', path: '/panoramas' })
  })

  it('allows empty campus panoramas', () => {
    const issues = checkPart({
      key: 'campus',
      sortKey: null,
      content: { schemaVersion: '1', metadata: {}, buildingOrder: [], presentCollections: [], panoramas: [] },
    })
    expect(issues).toEqual([])
  })

  it.each(['planImageId', 'floorPlanState', 'planAlignment', 'textureId', 'svgOverlayId'])(
    'flags floor field %s',
    (field) => {
      const issues = checkPart(floorRecord({ [field]: field === 'planAlignment' ? { x: 1 } : 'x' }))
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ code: 'NOT_ALLOWED_IN_1_5', path: `/${field}` })
    },
  )

  it('flags a nested data: URI string with its path', () => {
    const record = floorRecord({ rooms: [{ id: 'r', metadata: { note: 'data:image/png;base64,AAA' } }] })
    const issues = checkPart(record)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'NOT_ALLOWED_IN_1_5', path: '/rooms/0/metadata/note' })
  })

  it('escapes JSON pointer characters in paths', () => {
    const issues = checkPart(floorRecord({ metadata: { 'a/b~c': 'data:image/png;base64,AAA' } }))
    expect(issues[0].path).toBe('/metadata/a~1b~0c')
  })

  it('does not flag ordinary strings starting with "data:"', () => {
    const issues = checkPart(floorRecord({ rooms: [{ id: 'r', name: 'data: center', metadata: {} }] }))
    expect(issues).toEqual([])
  })

  it('flags data: URIs in non-floor parts too', () => {
    const issues = checkPart(poi({ id: 'p1', icon: 'data:image/svg+xml;base64,PHN2Zz4=' }))
    expect(issues).toEqual([expect.objectContaining({ code: 'NOT_ALLOWED_IN_1_5', path: '/icon' })])
  })
})

describe('checkPart: size', () => {
  function contentOfBytes(total: number): { id: string; blob: string } {
    const base = canonicalJson({ id: 'p1', blob: '' })
    return { id: 'p1', blob: 'a'.repeat(total - new TextEncoder().encode(base).length) }
  }
  const bytes = (value: unknown) => new TextEncoder().encode(canonicalJson(value)).length

  it('allows exactly the maximum', () => {
    const content = contentOfBytes(STUDIO_PART_MAX_BYTES)
    expect(bytes(content)).toBe(2_097_152)
    expect(checkPart(poi(content))).toEqual([])
  })

  it('flags 2 MB + 1 byte', () => {
    const content = contentOfBytes(STUDIO_PART_MAX_BYTES + 1)
    expect(bytes(content)).toBe(2_097_153)
    const issues = checkPart(poi(content))
    expect(codes(issues)).toEqual(['TOO_LARGE'])
    expect(issues[0].path).toBe('')
  })

  it('counts UTF-8 bytes, not characters', () => {
    const content = contentOfBytes(STUDIO_PART_MAX_BYTES)
    content.blob = content.blob.slice(0, -2) + '€' // 3 bytes replace 2: one byte over
    expect(bytes(content)).toBe(2_097_153)
    expect(codes(checkPart(poi(content)))).toEqual(['TOO_LARGE'])
  })
})

describe('checkPart: structure', () => {
  it('flags a floor whose id differs from its key', () => {
    const issues = checkPart(floorRecord({}, 'other', 'f1'))
    expect(issues).toEqual([expect.objectContaining({ code: 'INVALID_PART', path: '/id' })])
  })

  it('decodes encoded ids from the key', () => {
    expect(checkPart(floorRecord({}, 'bib/ground'))).toEqual([])
  })

  it('flags a missing or non-string id', () => {
    expect(codes(checkPart({ key: 'map/road:r1', sortKey: '000000', content: {} }))).toEqual(['INVALID_PART'])
    expect(codes(checkPart({ key: 'map/road:r1', sortKey: '000000', content: { id: 5 } }))).toEqual(['INVALID_PART'])
    expect(codes(checkPart(floorRecord({ id: '' }, '', 'f1')))).toEqual(['INVALID_PART'])
  })

  it('flags floor arrays that are not arrays and non-object metadata', () => {
    const issues = checkPart(floorRecord({ rooms: {}, hallways: null, metadata: 'x' }))
    expect(issues.map((i) => i.path).sort()).toEqual(['/hallways', '/metadata', '/rooms'])
    expect(new Set(codes(issues))).toEqual(new Set(['INVALID_PART']))
  })

  it('validates building wrapper parts', () => {
    const ok: PartRecord = {
      key: 'building:b1',
      sortKey: null,
      content: { building: { id: 'b1' }, floorOrder: ['f1'], qrCheckpoints: [{ id: 'q' }], qrSortKeys: ['000000'] },
    }
    expect(checkPart(ok)).toEqual([])
    const bad = checkPart({
      ...ok,
      content: { building: { id: 'zzz' }, floorOrder: [1], qrCheckpoints: [{}], qrSortKeys: [] },
    })
    expect(bad.map((i) => i.path).sort()).toEqual(['/building/id', '/floorOrder', '/qrSortKeys'])
    expect(codes(checkPart({ ...ok, content: {} }))).toContain('INVALID_PART')
  })

  it('validates campus parts', () => {
    const issues = checkPart({
      key: 'campus',
      sortKey: null,
      content: { buildingOrder: 'x', presentCollections: [1], metadata: [] },
    })
    expect(issues.map((i) => i.path).sort()).toEqual(['/buildingOrder', '/metadata', '/presentCollections'])
  })

  it('validates terrain parts', () => {
    expect(checkPart({ key: 'terrain', sortKey: null, content: {} })).toEqual([])
    expect(codes(checkPart({ key: 'terrain', sortKey: null, content: { terrainAreas: {} } }))).toEqual(['INVALID_PART'])
    expect(codes(checkPart({ key: 'terrain', sortKey: null, content: [] }))).toEqual(['INVALID_PART'])
  })

  it('flags a map item whose id differs from its key', () => {
    expect(codes(checkPart({ key: 'map/area:a1', sortKey: '000000', content: { id: 'a2' } }))).toEqual(['INVALID_PART'])
  })

  it('reports UNKNOWN_PART_KIND with an empty path and skips other checks', () => {
    const issues = checkPart({ key: 'bogus:1', sortKey: null, content: { x: 'data:image/png;base64,AAA' } })
    expect(issues).toEqual([expect.objectContaining({ key: 'bogus:1', code: 'UNKNOWN_PART_KIND', path: '' })])
    expect(codes(checkPart({ key: 'floor:onlyone', sortKey: null, content: {} }))).toEqual(['UNKNOWN_PART_KIND'])
  })

  it.each([null, undefined, 5, 'str', [], [1, 2], true])('never throws for content %j', (content) => {
    for (const key of ['campus', 'building:b', 'floor:b:f', 'terrain', 'map/road:r']) {
      expect(() => checkPart({ key, sortKey: null, content })).not.toThrow()
      expect(codes(checkPart({ key, sortKey: null, content }))).toContain('INVALID_PART')
    }
  })

  it('never throws for circular content', () => {
    const content: Record<string, unknown> = { id: 'r' }
    content.self = content
    const record: PartRecord = { key: 'map/road:r', sortKey: null, content }
    expect(() => checkPart(record)).not.toThrow()
    expect(codes(checkPart(record))).toContain('INVALID_PART')
  })
})

describe('checkPart: fixtures', () => {
  it('accepts every part of fixtureFull', () => {
    for (const part of splitDocument(fixtureFull()).parts) {
      expect(checkPart(part), part.key).toEqual([])
    }
  })

  it('accepts every part of fixtureLarge quickly', () => {
    const { parts } = splitDocument(fixtureLarge())
    const started = performance.now()
    for (const part of parts) expect(checkPart(part), part.key).toEqual([])
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('finds exactly the four NAVI 1.5 violations in fixtureWith15Violations', () => {
    const { parts } = splitDocument(fixtureWith15Violations())
    const issues = parts.flatMap(checkPart)
    expect(issues.every((i) => i.code === 'NOT_ALLOWED_IN_1_5')).toBe(true)
    const building = 'osm%3Away%2F123'
    expect(issues.map((i) => `${i.key}|${i.path}`).sort()).toEqual(
      [
        'campus|/panoramas',
        `floor:${building}:bib%2Fground|/textureId`,
        `floor:${building}:bib%2Fupper|/svgOverlayId`,
        `floor:${building}:bib%2Fground|/rooms/0/metadata/embeddedImage`,
      ].sort(),
    )
  })
})

describe('checkSettings', () => {
  it('accepts ordinary settings', () => {
    expect(checkSettings({ theme: 'x', map: { imageUrl: 'https://example.org/a.png' } })).toEqual([])
  })

  it('flags embedded data URIs with their path', () => {
    const issues = checkSettings({ map: { imageUrl: 'data:image/png;base64,AAAA' }, list: ['data:text/plain;base64,QQ=='] })
    expect(issues.map((i) => [i.code, i.path]).sort()).toEqual([
      ['NOT_ALLOWED_IN_1_5', '/list/0'],
      ['NOT_ALLOWED_IN_1_5', '/map/imageUrl'],
    ])
  })

  it('flags oversize settings and never throws on circular input', () => {
    expect(checkSettings({ n: 'x'.repeat(STUDIO_PART_MAX_BYTES + 1) })[0].code).toBe('TOO_LARGE')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(checkSettings(loop)[0].code).toBe('INVALID_PART')
  })
})
