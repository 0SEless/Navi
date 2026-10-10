import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CampusMap } from '@/types/campus-map'
import type { CampusDocument } from '@navi/core'

const routerPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

interface MockCampusStoreState {
  maps: CampusMap[]
  load: ReturnType<typeof vi.fn>
  deleteMap: ReturnType<typeof vi.fn>
  selectMap: ReturnType<typeof vi.fn>
}

let mockState: MockCampusStoreState = {
  maps: [],
  load: vi.fn(),
  deleteMap: vi.fn(),
  selectMap: vi.fn(),
}

vi.mock('@/store/campus-map-store', () => ({
  useCampusMapStore: Object.assign(
    (selector: (s: MockCampusStoreState) => unknown) => selector(mockState),
    { getState: vi.fn(() => mockState), subscribe: vi.fn(), setState: vi.fn() }
  ),
}))

import { DatasetManagement } from '../DatasetManagement'
import { getCampusDisplayStats } from '@/components/studio/studio-display-stats'
import { makeCampusDocument } from './dataset-fixture'
import { loadLegacyFixturePayload } from './dataset-legacy-fixture'

/**
 * Dataset Management campus-selection card statistics (Phase 3.3).
 *
 * The selection page must show the same authoritative statistics as
 * Studio through the SAME shared helper. Tests A-H of the phase brief.
 */

const fetchMock = vi.fn()

function makeMap(id: string, name: string, stats: Partial<CampusMap['stats']>): CampusMap {
  return {
    id,
    name,
    schoolName: 'Test School',
    center: { lat: 0, lng: 0 },
    boundary: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stats: stats as CampusMap['stats'],
  }
}

function arrayOf(n: number, prefix: string): Array<{ id: string }> {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))
}

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState = { maps: [], load: vi.fn(), deleteMap: vi.fn(), selectMap: vi.fn() }
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Test A - isolated synthetic legacy graph', () => {
  it('uses the matching synthetic graph instead of stale campus.stats', async () => {
    mockState.maps = [
      makeMap('navi-synthetic-legacy-campus', 'Synthetic Campus', {
        buildings: 29,
        nodes: 0,
        edges: 0,
      }),
    ]
    fetchMock.mockResolvedValue(okJson(loadLegacyFixturePayload()))

    render(<DatasetManagement />)

    expect(await screen.findByText('1')).toBeDefined()
    expect(screen.getAllByText('0')).toHaveLength(2)
    expect(screen.queryByText('29')).toBeNull()
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/graph?campus_id=navi-synthetic-legacy-campus'
    )
    expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
  })
})

describe('Test B - ABC/current graph (29 / 53 / 50)', () => {
  it('uses actual graph values instead of the stale 30 / 0 / 0', async () => {
    mockState.maps = [
      makeMap('map-ds-abc', 'abc', { buildings: 30, nodes: 0, edges: 0 }),
    ]
    fetchMock.mockResolvedValue(
      okJson({
        campusId: 'map-ds-abc',
        buildings: arrayOf(29, 'b'),
        nodes: arrayOf(53, 'n'),
        edges: arrayOf(50, 'e'),
      })
    )

    render(<DatasetManagement />)

    expect(await screen.findByText('29')).toBeDefined()
    expect(await screen.findByText('53')).toBeDefined()
    expect(await screen.findByText('50')).toBeDefined()
    expect(screen.queryByText('30')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('Test C - authored document precedence', () => {
  it('authored document wins for buildings while graph supplies nodes/edges', async () => {
    const authoredDocument = makeCampusDocument() // metadata.campusId = 'map-ds-1'
    mockState.maps = [makeMap('map-ds-1', 'Authored Campus', { buildings: 40, nodes: 0, edges: 0 })]
    fetchMock.mockResolvedValue(
      okJson({
        campusId: 'map-ds-1',
        buildings: arrayOf(29, 'b'),
        nodes: arrayOf(53, 'n'),
        edges: arrayOf(50, 'e'),
        authoredDocument,
      })
    )

    render(<DatasetManagement />)

    // Document has 2 buildings (fixture); graph building count not shown.
    expect(await screen.findByText(String(authoredDocument.buildings.length))).toBeDefined()
    expect(await screen.findByText('53')).toBeDefined()
    expect(await screen.findByText('50')).toBeDefined()
    expect(screen.queryByText('29')).toBeNull()
    expect(screen.queryByText('40')).toBeNull()
  })
})

describe('Test D - stale graph rejection', () => {
  it('never uses a payload that self-identifies as another campus', async () => {
    mockState.maps = [makeMap('map-a', 'Campus A', { buildings: 29, nodes: 0, edges: 0 })]
    fetchMock.mockResolvedValue(
      okJson({
        campusId: 'map-b',
        buildings: arrayOf(20, 'b'),
        nodes: arrayOf(301, 'n'),
        edges: arrayOf(308, 'e'),
      })
    )

    render(<DatasetManagement />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByText('29')).toBeDefined()
    expect(screen.queryByText('20')).toBeNull()
    expect(screen.queryByText('301')).toBeNull()
    expect(screen.queryByText('308')).toBeNull()
  })
})

describe('Test E - missing/empty graph', () => {
  it('preserves the existing campus.stats fallback (no fabricated zeros)', async () => {
    mockState.maps = [makeMap('map-a', 'Campus A', { buildings: 29, nodes: 0, edges: 0 })]
    fetchMock.mockResolvedValue(
      okJson({ campusId: 'map-a', buildings: [], nodes: [], edges: [] })
    )

    render(<DatasetManagement />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByText('29')).toBeDefined()
    // Existing fallback zeros remain exactly the two legacy node/edge zeros.
    expect(screen.getAllByText('0')).toHaveLength(2)
    expect(screen.queryByText('301')).toBeNull()
  })
})

describe('Test F - graph request failure', () => {
  it('a failed GET keeps the fallback and fabricates nothing', async () => {
    mockState.maps = [
      makeMap('map-map-1-repe', 'Aklan State University, Ibajay Campus', {
        buildings: 29,
        nodes: 0,
        edges: 0,
      }),
    ]
    fetchMock.mockRejectedValue(new Error('network down'))

    render(<DatasetManagement />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByText('29')).toBeDefined()
    expect(screen.queryByText('20')).toBeNull()
    expect(screen.queryByText('301')).toBeNull()
    expect(screen.queryByText('308')).toBeNull()
  })
})

describe('Test G - purity', () => {
  it('the statistics calculation never mutates campus, graph, or authoredDocument', () => {
    const campus = makeMap('map-map-1-repe', 'ASU', { buildings: 29, nodes: 0, edges: 0 })
    const graph = loadLegacyFixturePayload() as unknown as Parameters<
      typeof getCampusDisplayStats
    >[0]['graph']
    const authoredDocument: CampusDocument = makeCampusDocument()

    const campusBefore = JSON.stringify(campus)
    const graphBefore = JSON.stringify(graph)
    const docBefore = JSON.stringify(authoredDocument)

    getCampusDisplayStats({ campus, graph })
    getCampusDisplayStats({ campus, authoredDocument, graph })
    getCampusDisplayStats({ campus, graph: null, authoredDocument: null })

    expect(JSON.stringify(campus)).toBe(campusBefore)
    expect(JSON.stringify(graph)).toBe(graphBefore)
    expect(JSON.stringify(authoredDocument)).toBe(docBefore)
  })
})

describe('Test H - no hardcoded campus IDs (generic calculation)', () => {
  it('works for a campus id that appears nowhere in the implementation', async () => {
    mockState.maps = [makeMap('campus-generic-x', 'Generic', { buildings: 7, nodes: 1, edges: 2 })]
    fetchMock.mockResolvedValue(
      okJson({
        campusId: 'campus-generic-x',
        buildings: arrayOf(11, 'b'),
        nodes: arrayOf(12, 'n'),
        edges: arrayOf(13, 'e'),
      })
    )

    render(<DatasetManagement />)

    expect(await screen.findByText('11')).toBeDefined()
    expect(await screen.findByText('12')).toBeDefined()
    expect(await screen.findByText('13')).toBeDefined()
    expect(screen.queryByText('7')).toBeNull()
  })

  it('the selection page and shared helper contain no hardcoded campus ids or stat values', () => {
    const pageSrc = readFileSync(
      join(process.cwd(), 'src/components/pages/DatasetManagement.tsx'),
      'utf8'
    )
    const helperSrc = readFileSync(
      join(process.cwd(), 'src/components/studio/studio-display-stats.ts'),
      'utf8'
    )
    for (const src of [pageSrc, helperSrc]) {
      expect(src).not.toContain('map-map-1-repe')
      expect(src).not.toContain('map-map-1-k6bv')
    }
    // Verification expectations must never appear as implementation constants.
    expect(pageSrc).not.toMatch(/[^0-9]301[^0-9]/)
    expect(pageSrc).not.toMatch(/[^0-9]308[^0-9]/)
    expect(pageSrc).not.toMatch(/[^0-9]29[^0-9]/)
  })
})
