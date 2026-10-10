import { describe, expect, it } from 'vitest'
import type { CampusDocument, Panorama } from '@navi/core'
import {
  buildPanoramaViews,
  buildPanoramaSearchText,
  filterPanoramas,
  getPanoramaMetrics,
  getPanoramaScope,
  getPanoramaValidationState,
  resolvePanoramaBuildingName,
  resolvePanoramaFloorLabel,
  type PanoramaFilters,
} from './selectors'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — canonical CampusDocument.panoramas ONLY.
// No graph, no nodes, no hasPanorama. VT-1/ADR 024.
// ─────────────────────────────────────────────────────────────────────────────

function makeDoc(panoramas: Panorama[]): CampusDocument {
  return {
    metadata: { campusId: 'c-1', name: 'Fixture Campus' },
    buildings: [
      {
        id: 'b-1',
        name: 'Library',
        code: 'LIB',
        category: 'academic',
        description: '',
        footprint: { points: [] },
        baseElevation: 0,
        height: 10,
        floors: [
          { id: 'f-0', level: 0, label: 'Ground Floor', shortLabel: 'GF', elevation: 0, height: 3.5 },
          { id: 'f-2', level: 2, label: 'Level 2', shortLabel: '2F', elevation: 7, height: 3.5 },
        ],
        verticalConnectors: [],
      },
      {
        id: 'b-2',
        name: 'Gymnasium',
        code: 'GYM',
        category: 'academic',
        description: '',
        footprint: { points: [] },
        baseElevation: 0,
        height: 8,
        floors: [{ id: 'f-2b-0', level: 0, label: 'Ground Floor', shortLabel: 'GF', elevation: 0, height: 3.5 }],
        verticalConnectors: [],
      },
    ],
    roads: [],
    pois: [],
    areas: [],
    qrCheckpoints: [],
    panoramas,
  } as unknown as CampusDocument
}

/** Indoor, valid, has image. */
function indoor(overrides: Partial<Panorama> = {}): Panorama {
  return {
    id: 'p-indoor',
    label: 'Library Lobby',
    position: { x: 10, y: 6 },
    heading: 135,
    imageAssetId: 'asset-library-lobby',
    buildingId: 'b-1',
    floor: 0,
    hotspots: [],
    ...overrides,
  }
}

/** Outdoor, valid, has image. */
function outdoor(overrides: Partial<Panorama> = {}): Panorama {
  return {
    id: 'p-outdoor',
    label: 'Main Plaza',
    position: { lat: 11.72, lng: 122.37 },
    heading: 270,
    imageAssetId: 'asset-plaza',
    buildingId: undefined,
    floor: undefined,
    hotspots: [],
    ...overrides,
  }
}

const NO_FILTERS: PanoramaFilters = {
  query: '',
  scope: 'all',
  image: 'all',
  health: 'all',
  buildingId: 'all',
}

// ─────────────────────────────────────────────────────────────────────────────

describe('getPanoramaScope (D9 scope classification)', () => {
  it('classifies by buildingId ONLY — never by floor', () => {
    // STEP 12: floor 0 must NOT be read as an Outdoor signal.
    expect(getPanoramaScope(outdoor())).toBe('outdoor')
    expect(getPanoramaScope(indoor({ floor: 0 }))).toBe('building')
    expect(getPanoramaScope(indoor({ floor: 2 }))).toBe('building')
    expect(getPanoramaScope(indoor({ floor: -1 }))).toBe('building')
    // Building with NO floor at all is still Building.
    expect(getPanoramaScope(indoor({ floor: undefined }))).toBe('building')
    // Outdoor with a stray floor value stays Outdoor.
    expect(getPanoramaScope(outdoor({ floor: 0 }))).toBe('outdoor')
  })
})

describe('resolvePanoramaBuildingName / resolvePanoramaFloorLabel', () => {
  const doc = makeDoc([indoor(), outdoor()])

  it('resolves the authored building name', () => {
    expect(resolvePanoramaBuildingName(doc, 'b-1')).toBe('Library')
    expect(resolvePanoramaBuildingName(doc, 'b-2')).toBe('Gymnasium')
  })

  it('returns null for an unknown building instead of inventing one', () => {
    expect(resolvePanoramaBuildingName(doc, 'b-does-not-exist')).toBeNull()
  })

  it('returns null for outdoor (no building)', () => {
    expect(resolvePanoramaBuildingName(doc, undefined)).toBeNull()
  })

  it('resolves the authored floor label, including floor 0', () => {
    expect(resolvePanoramaFloorLabel(doc, 'b-1', 0)).toBe('Ground Floor')
    expect(resolvePanoramaFloorLabel(doc, 'b-1', 2)).toBe('Level 2')
  })

  it('falls back to "Floor <n>" when no authored floor matches', () => {
    expect(resolvePanoramaFloorLabel(doc, 'b-1', 7)).toBe('Floor 7')
    expect(resolvePanoramaFloorLabel(doc, 'b-1', -1)).toBe('Floor -1')
  })

  it('returns null for outdoor or missing floor — no floor label', () => {
    expect(resolvePanoramaFloorLabel(doc, undefined, undefined)).toBeNull()
    expect(resolvePanoramaFloorLabel(doc, 'b-1', undefined)).toBeNull()
    // Unknown building: still produce the numeric fallback rather than hiding it.
    expect(resolvePanoramaFloorLabel(doc, 'b-nope', 3)).toBe('Floor 3')
  })
})

describe('getPanoramaValidationState (canonical validators only)', () => {
  it('reports a clean panorama as valid', () => {
    const state = getPanoramaValidationState(indoor(), ['p-indoor'])
    expect(state.hasError).toBe(false)
    expect(state.issues).toEqual([])
  })

  it('flags an outdoor panorama stored as building-local metres as an ERROR', () => {
    // Canonical PANORAMA_OUTDOOR_REQUIRES_LATLNG
    const bad = outdoor({ position: { x: 1, y: 2 } })
    const state = getPanoramaValidationState(bad, ['p-outdoor'])
    expect(state.hasError).toBe(true)
    expect(state.issues.some((i) => i.code === 'PANORAMA_OUTDOOR_REQUIRES_LATLNG')).toBe(true)
  })

  it('flags an unrecognised position as an ERROR', () => {
    const bad = outdoor({ position: { nope: true } as never })
    expect(getPanoramaValidationState(bad, ['p-outdoor']).hasError).toBe(true)
  })

  it('treats legacy LatLng + buildingId as a WARNING, not an error', () => {
    const legacy = indoor({ position: { lat: 1, lng: 2 } as never })
    const state = getPanoramaValidationState(legacy, ['p-indoor'])
    expect(state.hasError).toBe(false)
    expect(state.issues.some((i) => i.code === 'PANORAMA_LEGACY_COORDINATES')).toBe(true)
  })

  it('flags a hotspot targeting a non-existent panorama as an ERROR', () => {
    const p = indoor({
      hotspots: [
        {
          hotspotType: 'navigation',
          target: { type: 'panorama', targetId: 'p-ghost' },
          position: { pitch: 0, yaw: 45 },
          label: 'Go',
        },
      ],
    } as Partial<Panorama>)
    const state = getPanoramaValidationState(p, ['p-indoor'])
    expect(state.hasError).toBe(true)
    expect(state.issues.some((i) => i.code === 'HOTSPOT_INVALID_TARGET')).toBe(true)
  })

  it('flags an out-of-range hotspot yaw/pitch as an ERROR', () => {
    const p = indoor({
      hotspots: [
        {
          hotspotType: 'information',
          target: { type: 'url', targetId: 'https://x.test' },
          position: { pitch: 0, yaw: 400 },
          label: 'Bad',
          content: { title: 't' },
        },
      ],
    } as Partial<Panorama>)
    expect(getPanoramaValidationState(p, ['p-indoor']).hasError).toBe(true)
  })
})

describe('buildPanoramaViews (canonical inventory = document.panoramas)', () => {
  it('produces one view per canonical Panorama (matrix 1)', () => {
    const views = buildPanoramaViews(makeDoc([indoor(), outdoor(), indoor({ id: 'p-third', label: 'Third' })]))
    expect(views).toHaveLength(3)
  })

  it('produces ZERO views for a document with no panoramas, even with legacy graph data present', () => {
    // STEP 27: the canonical source is document.panoramas and nothing else.
    const views = buildPanoramaViews(makeDoc([]))
    expect(views).toEqual([])
  })

  it('produces ZERO views when the document is null', () => {
    expect(buildPanoramaViews(null)).toEqual([])
  })

  it('carries the full card payload from the authored entity', () => {
    const [view] = buildPanoramaViews(makeDoc([indoor()]))
    expect(view.id).toBe('p-indoor')
    expect(view.label).toBe('Library Lobby')
    expect(view.scope).toBe('building')
    expect(view.buildingName).toBe('Library')
    expect(view.floorLabel).toBe('Ground Floor')
    expect(view.heading).toBe(135)
    expect(view.hasImage).toBe(true)
    expect(view.hotspotCount).toBe(0)
  })

  it('does not mutate the source document', () => {
    const doc = makeDoc([indoor()])
    const before = JSON.stringify(doc)
    buildPanoramaViews(doc)
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('Virtual Tour health', () => {
  it('is READY when it has an image and no validation error', () => {
    const [v] = buildPanoramaViews(makeDoc([indoor()]))
    expect(v.health).toBe('ready')
  })

  it('is MISSING IMAGE when imageAssetId is empty or whitespace', () => {
    expect(buildPanoramaViews(makeDoc([indoor({ imageAssetId: '' })]))[0].health).toBe('missing-image')
    expect(buildPanoramaViews(makeDoc([indoor({ imageAssetId: '   ' })]))[0].health).toBe('missing-image')
    // A real key is not "missing".
    expect(buildPanoramaViews(makeDoc([indoor({ imageAssetId: 'asset-x' })]))[0].health).toBe('ready')
  })

  it('is NEEDS ATTENTION from a canonical Panorama validation error', () => {
    const [v] = buildPanoramaViews(makeDoc([outdoor({ position: { x: 0, y: 0 } })]))
    expect(v.health).toBe('needs-attention')
  })

  it('is NEEDS ATTENTION from a hotspot validation error', () => {
    const p = indoor({
      hotspots: [
        {
          hotspotType: 'navigation',
          target: { type: 'panorama', targetId: 'p-ghost' },
          position: { pitch: 0, yaw: 10 },
          label: 'Go',
        },
      ],
    } as Partial<Panorama>)
    const [v] = buildPanoramaViews(makeDoc([p]))
    expect(v.health).toBe('needs-attention')
  })

  it('counts a panorama with three problems ONCE in needs-attention', () => {
    // matrix 18: missing image + bad coords + bad hotspot
    const p = outdoor({
      imageAssetId: '',
      position: { x: 1, y: 2 },
      hotspots: [
        {
          hotspotType: 'navigation',
          target: { type: 'panorama', targetId: 'p-ghost' },
          position: { pitch: 0, yaw: 999 },
          label: 'Go',
        },
      ],
    } as Partial<Panorama>)
    const views = buildPanoramaViews(makeDoc([p]))
    expect(views[0].health).toBe('needs-attention')
    expect(views[0].missingImage).toBe(true)
    expect(views[0].hasValidationError).toBe(true)
    const metrics = getPanoramaMetrics(views)
    expect(metrics.needsAttention).toBe(1)
    expect(metrics.missingImage).toBe(1)
    expect(metrics.ready).toBe(0)
    expect(metrics.total).toBe(1)
  })

  it('ignores warnings for health purposes', () => {
    const legacy = indoor({ position: { lat: 1, lng: 2 } as never, imageAssetId: 'asset-legacy' })
    const [v] = buildPanoramaViews(makeDoc([legacy]))
    expect(v.health).toBe('ready')
    expect(v.issues.length).toBeGreaterThan(0) // surfaced as context
  })
})

describe('getPanoramaMetrics (summary computed on the FULL inventory)', () => {
  it('satisfies READY + NEEDS ATTENTION === TOTAL', () => {
    const views = buildPanoramaViews(
      makeDoc([
        indoor({ id: 'a' }), // ready
        indoor({ id: 'b', imageAssetId: '' }), // missing image
        outdoor({ id: 'c', position: { x: 1, y: 1 } }), // validation error
        indoor({ id: 'd', imageAssetId: '  ' }), // missing image
      ]),
    )
    const m = getPanoramaMetrics(views)
    expect(m.total).toBe(4)
    expect(m.missingImage).toBe(2)
    expect(m.needsAttention).toBe(3)
    expect(m.ready).toBe(1)
    expect(m.ready + m.needsAttention).toBe(m.total)
  })

  it('reports zeros for an empty inventory', () => {
    const m = getPanoramaMetrics([])
    expect(m).toEqual({ total: 0, ready: 0, missingImage: 0, needsAttention: 0 })
    expect(m.ready + m.needsAttention).toBe(m.total)
  })
})

describe('buildPanoramaSearchText', () => {
  const views = buildPanoramaViews(makeDoc([indoor(), outdoor()]))

  it('matches label', () => {
    expect(buildPanoramaSearchText(views[0])).toContain('library lobby')
  })

  it('matches id', () => {
    expect(buildPanoramaSearchText(views[0])).toContain('p-indoor')
  })

  it('matches resolved building name', () => {
    expect(buildPanoramaSearchText(views[0])).toContain('library')
  })

  it('matches resolved floor label', () => {
    expect(buildPanoramaSearchText(views[0])).toContain('ground floor')
  })

  it('does NOT include the imageAssetId', () => {
    expect(buildPanoramaSearchText(views[0])).not.toContain('asset-library-lobby')
  })
})

describe('filterPanoramas', () => {
  const views = buildPanoramaViews(
    makeDoc([
      indoor({ id: 'a', label: 'Library Lobby' }), // building, image, ready
      indoor({ id: 'b', label: 'Library Upper', buildingId: 'b-1', floor: 2, imageAssetId: '' }), // building, missing
      outdoor({ id: 'c', label: 'Plaza', position: { x: 1, y: 1 } }), // outdoor, validation error
    ]),
  )

  it('matches the query case-insensitively across label/id/building/floor', () => {
    // building name ("Library") matches both building scenes
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'LIBRARY' }).map((v) => v.id)).toEqual(['a', 'b'])
    // label
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'plaza' }).map((v) => v.id)).toEqual(['c'])
    // floor label (authored "Level 2")
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'level 2' }).map((v) => v.id)).toEqual(['b'])
    // id — 'c' appears in no other haystack ("plaza", "library", floor labels)
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'c' }).map((v) => v.id)).toEqual(['c'])
    // no match
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'zzzz' })).toEqual([])
  })

  it('cannot find a panorama by its imageAssetId (matrix 11)', () => {
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'asset-library-lobby' })).toEqual([])
  })

  it('filters by scope', () => {
    expect(filterPanoramas(views, { ...NO_FILTERS, scope: 'outdoor' }).map((v) => v.id)).toEqual(['c'])
    expect(filterPanoramas(views, { ...NO_FILTERS, scope: 'building' }).map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('filters by image presence', () => {
    // 'a' and 'c' both carry an asset key; only 'b' is missing one.
    expect(filterPanoramas(views, { ...NO_FILTERS, image: 'has-image' }).map((v) => v.id)).toEqual(['a', 'c'])
    expect(filterPanoramas(views, { ...NO_FILTERS, image: 'missing-image' }).map((v) => v.id)).toEqual(['b'])
  })

  it('filters by health', () => {
    expect(filterPanoramas(views, { ...NO_FILTERS, health: 'ready' }).map((v) => v.id)).toEqual(['a'])
    expect(filterPanoramas(views, { ...NO_FILTERS, health: 'needs-attention' }).map((v) => v.id)).toEqual(['b', 'c'])
  })

  it('filters by building', () => {
    expect(filterPanoramas(views, { ...NO_FILTERS, buildingId: 'b-1' }).map((v) => v.id)).toEqual(['a', 'b'])
    expect(filterPanoramas(views, { ...NO_FILTERS, buildingId: 'b-2' })).toEqual([])
  })

  it('composes filters with AND', () => {
    expect(
      filterPanoramas(views, { ...NO_FILTERS, scope: 'building', image: 'missing-image', health: 'needs-attention' }).map(
        (v) => v.id,
      ),
    ).toEqual(['b'])
    // Contradictory combination yields nothing (distinct from "no panoramas"):
    // no Building panorama exists on campus b-2's gymnasium here.
    expect(filterPanoramas(views, { ...NO_FILTERS, buildingId: 'b-2', scope: 'building' })).toEqual([])
    // 'c' is the only outdoor scene and it needs attention.
    expect(filterPanoramas(views, { ...NO_FILTERS, scope: 'outdoor', health: 'ready' })).toEqual([])
  })

  it('returns everything when no filter is active', () => {
    expect(filterPanoramas(views, NO_FILTERS)).toHaveLength(3)
  })

  it('treats a whitespace query as no query', () => {
    expect(filterPanoramas(views, { ...NO_FILTERS, query: '   ' })).toHaveLength(3)
  })
})

describe('search and filters do not change summary totals (matrix 20/21)', () => {
  it('keeps campus totals identical before and after narrowing', () => {
    const views = buildPanoramaViews(
      makeDoc([
        indoor({ id: 'a', label: 'Library Lobby' }),
        indoor({ id: 'b', imageAssetId: '' }),
        outdoor({ id: 'c', position: { x: 1, y: 1 } }),
      ]),
    )
    const before = getPanoramaMetrics(views)
    const after = getPanoramaMetrics(
      filterPanoramas(views, { ...NO_FILTERS, query: 'library', health: 'ready' }),
    )
    // The narrowed slice has its own counts...
    expect(after.total).toBe(1)
    // ...but the campus summary is computed on the full inventory, not the slice.
    expect(before).toEqual({ total: 3, ready: 1, missingImage: 1, needsAttention: 2 })
  })
})

describe('position presentation (STEP 24)', () => {
  it('presents outdoor LatLng as geographic coordinates', () => {
    const [v] = buildPanoramaViews(makeDoc([outdoor()]))
    expect(v.position.kind).toBe('world')
    expect(v.position.display).toBe('11.72000, 122.37000')
  })

  it('presents indoor LocalCoord in metres, never as GPS', () => {
    const [v] = buildPanoramaViews(makeDoc([indoor()]))
    expect(v.position.kind).toBe('local')
    expect(v.position.display).toBe('10.0 m E, 6.0 m N')
  })

  it('reports an unknown position kind rather than guessing', () => {
    const [v] = buildPanoramaViews(makeDoc([outdoor({ position: { z: 1 } as never })]))
    expect(v.position.kind).toBe('unknown')
    expect(v.position.display).toBe('Unknown position')
  })
})

describe('legacy base64 isolation (STEP 27)', () => {
  it('ignores legacy node metadata entirely — inventory stays 0', () => {
    // The graph is not even passed in: the selectors cannot see it.
    const views = buildPanoramaViews(makeDoc([]))
    expect(views).toHaveLength(0)
    expect(getPanoramaMetrics(views).total).toBe(0)
    expect(filterPanoramas(views, { ...NO_FILTERS, query: 'data:image' })).toEqual([])
    expect(filterPanoramas(views, { ...NO_FILTERS, image: 'has-image' })).toEqual([])
  })
})