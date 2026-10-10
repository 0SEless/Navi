import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'

const routerPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href?: unknown
  children?: ReactNode
}

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={typeof href === 'string' ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}))

type MockCampusState = {
  maps: CampusMap[]
  load: ReturnType<typeof vi.fn>
  deleteMap: ReturnType<typeof vi.fn>
  selectMap: ReturnType<typeof vi.fn>
}

let mockState: MockCampusState = {
  maps: [],
  load: vi.fn(),
  deleteMap: vi.fn(),
  selectMap: vi.fn(),
}

vi.mock('@/store/campus-map-store', () => ({
  useCampusMapStore: Object.assign(
    (selector: (state: MockCampusState) => unknown) => selector(mockState),
    { getState: vi.fn(() => mockState), subscribe: vi.fn(), setState: vi.fn() },
  ),
}))

type MockGraphState = {
  authoredDocument: CampusDocument | null
  currentMapId: string | null
  syncStatus: string
  graph: Graph | null
  loadMapData: ReturnType<typeof vi.fn>
}

let mockGraph: MockGraphState = {
  authoredDocument: null,
  currentMapId: null,
  syncStatus: 'idle',
  graph: null,
  loadMapData: vi.fn(),
}

vi.mock('@/store/graph-store', () => ({
  useGraphStore: Object.assign(
    (selector: (state: MockGraphState) => unknown) => selector(mockGraph),
    { getState: vi.fn(() => mockGraph), setState: vi.fn(), subscribe: vi.fn() },
  ),
}))

import { DatasetManagement } from '../DatasetManagement'
import { DatasetWorkspace } from '../DatasetWorkspace'
import DatasetWorkspacePage from '@/app/(admin)/dataset/[id]/page'
import { makeCampusDocument } from './dataset-fixture'
import { Graph } from '@/engine/graph'
import { LEGACY_FIXTURE_STATS, loadLegacyFixtureGraph } from './dataset-legacy-fixture'

const mockMap = (overrides: Partial<CampusMap> = {}): CampusMap => ({
  id: 'map-ds-1',
  name: 'ASU Ibajay',
  schoolName: 'ASU',
  campusName: 'Ibajay Campus',
  center: { lat: 10, lng: 20 },
  boundary: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  stats: { buildings: 8, nodes: 100, edges: 148 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockState = { maps: [], load: vi.fn(), deleteMap: vi.fn(), selectMap: vi.fn() }
  mockGraph = { authoredDocument: null, currentMapId: null, syncStatus: 'idle', graph: null, loadMapData: vi.fn() }
})

describe('DatasetManagement (campus selection entry)', () => {
  it('renders the entry header', () => {
    render(<DatasetManagement />)
    expect(screen.getByText('Dataset Management')).toBeDefined()
    expect(screen.getByText(/Select an authored campus/)).toBeDefined()
  })

  it('loads the campus store on mount', () => {
    render(<DatasetManagement />)
    expect(mockState.load).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state pointing to NAVI Studio when no campuses exist', () => {
    render(<DatasetManagement />)
    expect(screen.getByText('No authored campuses yet')).toBeDefined()
    expect(screen.getByText('Open NAVI Studio')).toBeDefined()
  })

  it('renders one card per authored campus with its stats', () => {
    mockState.maps = [mockMap(), mockMap({ id: 'map-ds-2', name: 'Tourism Building Campus' })]
    render(<DatasetManagement />)
    expect(screen.getByText('ASU Ibajay')).toBeDefined()
    expect(screen.getByText('Tourism Building Campus')).toBeDefined()
    expect(screen.getByText(/2 campuses available/)).toBeDefined()
  })

  it('does NOT auto-select or auto-navigate on render (explicit selection only)', () => {
    mockState.maps = [mockMap()]
    render(<DatasetManagement />)
    expect(routerPush).not.toHaveBeenCalled()
    expect(mockState.selectMap).not.toHaveBeenCalled()
  })

  it('navigates to the dataset workspace when a campus card is clicked', () => {
    mockState.maps = [mockMap()]
    render(<DatasetManagement />)
    fireEvent.click(screen.getByText('ASU Ibajay'))
    expect(routerPush).toHaveBeenCalledWith('/dataset/map-ds-1')
  })
})

describe('DatasetWorkspace (shell)', () => {
  it('shows the selected campus identity in the header', () => {
    render(<DatasetWorkspace campus={mockMap()} document={makeCampusDocument()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dataset Management' })).toBeDefined()
    expect(screen.getByTestId('dataset-current-location').textContent).toBe('ASU Ibajay')
    // Header count is authoritative (document buildings = 2), not the stale
    // campus.stats metadata (8) that the subtitle used before the repair.
    expect(screen.getByText(/ASU · Ibajay Campus · 2 buildings/)).toBeDefined()
    expect(screen.queryByText(/8 buildings/)).toBeNull()
  })

  it('links back to campus selection', () => {
    render(<DatasetWorkspace campus={mockMap()} document={makeCampusDocument()} />)
    expect(screen.getByRole('link', { name: 'Back to campus selection' }).getAttribute('href')).toBe('/dataset')
  })

  it('shows all four content types as tabs with Information active by default', () => {
    render(<DatasetWorkspace campus={mockMap()} document={makeCampusDocument()} />)
    expect(screen.getByRole('tab', { name: 'Information' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Images' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Dataset' })).toBeDefined()
    expect(screen.getByRole('tab', { name: '360' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Information' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: '360' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tablist', { name: 'Content types' })).toBeDefined()
    expect(screen.getByRole('tabpanel')).toBeDefined()
  })
})

describe('/dataset/[id] page states', () => {
  // React 19 `use(params)` suspends on first render; flush it with an async
  // act, matching the existing capture-library page test pattern.
  const renderPage = async (id: string) => {
    await act(async () => {
      render(<DatasetWorkspacePage params={Promise.resolve({ id })} />)
    })
  }

  it('shows the workspace for an existing campus (deep link)', async () => {
    mockState.maps = [mockMap()]
    mockGraph = {
      authoredDocument: makeCampusDocument(),
      currentMapId: 'map-ds-1',
      syncStatus: 'synced',
      graph: null,
      loadMapData: vi.fn(),
    }
    await renderPage('map-ds-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Dataset Management' })).toBeDefined()
    expect(screen.getByTestId('dataset-current-location').textContent).toBe('ASU Ibajay')
  })

  it('shows a loading state while no campuses are hydrated', async () => {
    await renderPage('map-ds-1')
    expect(screen.getByText('Loading campus…')).toBeDefined()
  })

  it('shows a not-found state with a back link for an unknown campus id', async () => {
    mockState.maps = [mockMap()]
    await renderPage('map-unknown')
    expect(screen.getByText('Campus not found')).toBeDefined()
    expect(screen.getByText('Back to Dataset Management').closest('a')?.getAttribute('href')).toBe('/dataset')
  })

  it('hydrates the campus store on mount', async () => {
    await renderPage('map-ds-1')
    expect(mockState.load).toHaveBeenCalledTimes(1)
  })

  it('requests the authored document for the campus id', async () => {
    mockState.maps = [mockMap()]
    await renderPage('map-ds-1')
    expect(mockGraph.loadMapData).toHaveBeenCalledWith('map-ds-1')
  })

  it('shows a loading state while the authored document is being fetched', async () => {
    mockState.maps = [mockMap()]
    mockGraph = {
      authoredDocument: null,
      currentMapId: null,
      syncStatus: 'syncing',
      graph: null,
      loadMapData: vi.fn(),
    }
    await renderPage('map-ds-1')
    expect(screen.getByText('Loading campus data…')).toBeDefined()
    expect(screen.getByText(/Loading the authored document for ASU Ibajay/)).toBeDefined()
  })

  it('shows a retryable error state when the authored document fails to load', async () => {
    mockState.maps = [mockMap()]
    // currentMapId stays null with syncStatus 'idle' after the attempt —
    // the mock never flips to 'syncing', exactly modelling a failed load.
    await renderPage('map-ds-1')
    expect(screen.getByText('Campus data could not be loaded')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockGraph.loadMapData).toHaveBeenCalledWith('map-ds-1')
  })

  // ── Phase 3.2: effective-document resolution ──────────────────────────

  it('derives the effective document for a legacy graph campus (no unavailable state)', async () => {
    mockState.maps = [mockMap({ id: LEGACY_FIXTURE_STATS.campusId, name: 'Synthetic Legacy Campus' })]
    mockGraph = {
      authoredDocument: null,
      currentMapId: LEGACY_FIXTURE_STATS.campusId,
      syncStatus: 'synced',
      graph: loadLegacyFixtureGraph(),
      loadMapData: vi.fn(),
    }
    await renderPage(LEGACY_FIXTURE_STATS.campusId)

    // Presence: the canonical projection renders the real hierarchy (20
    // buildings / 29 floors / 32 outdoor POIs from the fixture).
    expect(screen.getByRole('heading', { level: 1, name: 'Dataset Management' })).toBeDefined()
    expect(screen.getByTestId('dataset-current-location').textContent).toBe('Synthetic Legacy Campus')
    expect(document.querySelectorAll('[data-explorer-node="building"]')).toHaveLength(
      LEGACY_FIXTURE_STATS.buildings,
    )
    expect(screen.getByText('Synthetic Library')).toBeDefined()

    // Absence: the old degraded states must NOT render (ERRORS.md rule:
    // absence assertions always pair queryBy* with toBeNull()).
    expect(screen.queryByText('Authored document is not available for this campus.')).toBeNull()
    expect(screen.queryByText(/Only campus-level information is shown/)).toBeNull()

    // The derived hierarchy is interactive: expanding a building reveals its
    // authored floors exactly like the authored path does.
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Synthetic Library' }),
    )
    expect(screen.getByRole('button', { name: 'Ground Floor' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Ground Floor' }))
    expect(
      screen.getByTestId('dataset-current-location').textContent,
    ).toBe('Synthetic Legacy Campus / Synthetic Library / Ground Floor')
  })

  it('renders authored dataset records for the legacy campus in the Dataset tab', async () => {
    mockState.maps = [mockMap({ id: LEGACY_FIXTURE_STATS.campusId, name: 'Synthetic Legacy Campus' })]
    mockGraph = {
      authoredDocument: null,
      currentMapId: LEGACY_FIXTURE_STATS.campusId,
      syncStatus: 'synced',
      graph: loadLegacyFixtureGraph(),
      loadMapData: vi.fn(),
    }
    await renderPage(LEGACY_FIXTURE_STATS.campusId)

    fireEvent.click(screen.getByRole('tab', { name: 'Dataset' }))
    const panel = screen.getByRole('tabpanel')
    expect(panel).toBeDefined()
    expect(panel.textContent).toContain('Synthetic Library')
    // The synthetic fixture has no road traces.
    expect(panel.textContent).toContain('No roads are authored for this campus.')
  })

  it('keeps the unavailable state when neither the authored document nor the graph has content', async () => {
    mockState.maps = [mockMap()]
    mockGraph = {
      authoredDocument: null,
      currentMapId: 'map-ds-1',
      syncStatus: 'synced',
      graph: new Graph(),
      loadMapData: vi.fn(),
    }
    await renderPage('map-ds-1')
    expect(
      screen.getAllByText('Authored document is not available for this campus.').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Computer Science Building')).toBeNull()
  })

  it('never projects a stale graph from another campus into the route', async () => {
    mockState.maps = [mockMap()]
    // A contentful legacy graph exists, but currentMapId does not match the
    // route — the workspace must still be in its loading state.
    mockGraph = {
      authoredDocument: null,
      currentMapId: null,
      syncStatus: 'syncing',
      graph: loadLegacyFixtureGraph(),
      loadMapData: vi.fn(),
    }
    await renderPage('map-ds-1')
    expect(screen.getByText('Loading campus data…')).toBeDefined()
    expect(screen.queryByText('Synthetic Library')).toBeNull()
  })
})
