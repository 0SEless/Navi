import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument, Panorama } from '@navi/core'
import { Graph } from '@/engine/graph'
import { useCampusMapStore } from '@/store/campus-map-store'
import { useGraphStore } from '@/store/graph-store'
import PanoramaManagementPage from './page'

/**
 * PM-3 — container integration tests.
 *
 * Uses the REAL zustand stores (via setState) so the ownership and stale-load
 * guards are exercised against genuine store behaviour rather than a hand-rolled
 * stub. Only `next/navigation` and `fetch` are mocked.
 */

const routerReplace = vi.fn()
let searchParams = new URLSearchParams()
let suspendSearchParams = false
vi.mock('@/components/tour/TourViewer', () => ({ TourViewer: (props: { initialIndex: number; panoramas: Array<{ label: string }>; onPanoramaChange: (index: number) => void }) => <div data-testid="tour-viewer">Viewing {props.panoramas[props.initialIndex].label}<button onClick={() => props.onPanoramaChange(1)}>Preview transition</button></div> }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => {
    if (suspendSearchParams) throw new Promise(() => {})
    return searchParams
  },
  usePathname: () => '/panoramas',
}))

// Never resolve: keeps the page under test from settling onto server data and
// keeps every assertion deterministic and offline.
const fetchStub = vi.fn(() => new Promise<Response>(() => {}))

function campus(id: string, name: string) {
  return {
    id,
    name,
    schoolName: 'School',
    boundary: [],
    center: { lat: 0, lng: 0 },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    stats: { buildings: 0, nodes: 0, edges: 0 },
  }
}

function makeDoc(campusId: string, panoramas: Panorama[]): CampusDocument {
  return {
    metadata: { campusId, name: `Campus ${campusId}` },
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
        floors: [{ id: 'f-0', level: 0, label: 'Ground Floor', elevation: 0, height: 3.5 }],
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

const PANO_A: Panorama = {
  id: 'p-a',
  label: 'Alpha Scene',
  position: { lat: 1, lng: 2 },
  heading: 10,
  imageAssetId: 'asset-a',
  buildingId: undefined,
  floor: undefined,
  hotspots: [],
}

const PANO_B: Panorama = {
  id: 'p-b',
  label: 'Bravo Scene',
  position: { lat: 3, lng: 4 },
  heading: 20,
  imageAssetId: 'asset-b',
  buildingId: undefined,
  floor: undefined,
  hotspots: [],
}

function setGraphState(state: {
  currentMapId: string | null
  authoredDocument: CampusDocument | null
  syncStatus?: 'idle' | 'syncing' | 'checking' | 'synced' | 'error' | 'conflict'
  syncError?: string | null
}) {
  useGraphStore.setState({
    currentMapId: state.currentMapId,
    authoredDocument: state.authoredDocument,
    graph: new Graph(),
    syncStatus: state.syncStatus ?? 'synced',
    syncError: state.syncError ?? null,
  })
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.clearAllMocks()
  searchParams = new URLSearchParams()
  suspendSearchParams = false
  vi.stubGlobal('fetch', fetchStub)
  useCampusMapStore.setState({
    maps: [campus('c-1', 'Campus One'), campus('c-2', 'Campus Two')],
  })
  setGraphState({ currentMapId: null, authoredDocument: null })
  window.localStorage.clear()
})

describe('route-level search parameter loading', () => {
  it('shows a loading fallback while the query-driven content suspends', () => {
    suspendSearchParams = true

    render(<PanoramaManagementPage />)

    expect(screen.getByRole('status', { name: 'Loading Panorama Management' })).toBeInTheDocument()
  })
})

describe('dedicated scene URL contract', () => {
  it('hydrates the requested pano after a route reload and preserves it during canonical campus resolution', async () => {
    searchParams = new URLSearchParams('pano=p-b')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A, PANO_B]) })
    render(<PanoramaManagementPage />)
    expect(await screen.findByText('Viewing Bravo Scene')).toBeTruthy()
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/panoramas?campus=c-1&pano=p-b'))
  })
  it('scene selection and viewer transitions replace the URL inside panoramas', async () => {
    searchParams = new URLSearchParams('campus=c-1&pano=p-a')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A, PANO_B]) })
    render(<PanoramaManagementPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Select scene Bravo Scene' }))
    expect(routerReplace).toHaveBeenLastCalledWith('/panoramas?campus=c-1&pano=p-b')
    fireEvent.click(screen.getByText('Preview transition'))
    expect(routerReplace).toHaveBeenLastCalledWith('/panoramas?campus=c-1&pano=p-b')
  })
})

// ── URL campus contract (STEP 3) ────────────────────────────────────────────

describe('URL campus contract', () => {
  it('A — uses an explicit known campus and hydrates its authored panoramas', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })

    render(<PanoramaManagementPage />)

    expect(await screen.findByRole('button', { name: 'Select scene Alpha Scene' })).toBeTruthy()
    expect(screen.getByText('Showing 1 of 1 scenes')).toBeTruthy()
  })

  it('B — an unknown ?campus renders campus-not-found and never falls back (matrix 24)', async () => {
    searchParams = new URLSearchParams('campus=c-ghost')
    // A perfectly good c-1 is loaded — it must NOT be shown instead.
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })

    render(<PanoramaManagementPage />)

    expect(await screen.findByText('That campus is no longer available.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Select scene Alpha Scene' })).toBeNull()
  })

  it('C — no param falls back to currentMapId', async () => {
    setGraphState({ currentMapId: 'c-2', authoredDocument: makeDoc('c-2', [PANO_B]) })

    render(<PanoramaManagementPage />)

    expect(await screen.findByRole('button', { name: 'Select scene Bravo Scene' })).toBeTruthy()
  })

  it('D — canonicalises the URL for a single implicit campus', async () => {
    useCampusMapStore.setState({ maps: [campus('c-1', 'Only Campus')] })
    setGraphState({ currentMapId: null, authoredDocument: makeDoc('c-1', [PANO_A]) })

    render(<PanoramaManagementPage />)

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/panoramas?campus=c-1'))
  })

  it('E — no param, several campuses, no usable currentMapId (matrix 23)', async () => {
    render(<PanoramaManagementPage />)

    expect(await screen.findByText('Select a campus to manage its panoramas.')).toBeTruthy()
  })

  it('changing campus writes ?campus= (URL stays authoritative)', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })
    render(<PanoramaManagementPage />)
    await screen.findByRole('button', { name: 'Select scene Alpha Scene' })

    const select = screen.getByLabelText('Campus') as HTMLSelectElement
    select.value = 'c-2'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/panoramas?campus=c-2'))
  })
})

// ── Ownership + stale race (STEP 7/8) ───────────────────────────────────────

describe('selected-campus ownership and stale loads', () => {
  it('does not render a misaligned campus document under the selected URL (STEP 7)', async () => {
    // URL says c-2, but the loaded document is still c-1's.
    searchParams = new URLSearchParams('campus=c-2')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })

    render(<PanoramaManagementPage />)

    expect(await screen.findByText('Loading panoramas…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Select scene Alpha Scene' })).toBeNull()
  })

  it('matrix 28 — a late campus-A load cannot overwrite campus B', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })
    render(<PanoramaManagementPage />)
    await screen.findByRole('button', { name: 'Select scene Alpha Scene' })

    // The user switches to campus B while campus A is still the loaded document.
    // The store write is what re-renders; the URL change alone would not.
    searchParams = new URLSearchParams('campus=c-2')
    useGraphStore.setState({ syncStatus: 'checking' })

    // Campus A's scene must not be shown while B is the selected campus.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select scene Alpha Scene' })).toBeNull())

    // A's load finally lands late — it may not reclaim the page.
    useGraphStore.setState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select scene Alpha Scene' })).toBeNull())

    // B's own load lands — B now owns the page and only B is shown.
    useGraphStore.setState({ currentMapId: 'c-2', authoredDocument: makeDoc('c-2', [PANO_B]), syncStatus: 'synced' })

    expect(await screen.findByRole('button', { name: 'Select scene Bravo Scene' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Select scene Alpha Scene' })).toBeNull()
  })

  it('re-issues the load for the selected campus when the store lands on another one', async () => {
    searchParams = new URLSearchParams('campus=c-2')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })
    const loadSpy = vi.spyOn(useGraphStore.getState(), 'loadMapData')

    render(<PanoramaManagementPage />)

    await waitFor(() => expect(loadSpy).toHaveBeenCalledWith('c-2'))
    loadSpy.mockRestore()
  })
})

// ── Document + error states (STEP 19/20) ────────────────────────────────────

describe('document and error states', () => {
  it('G — a campus with no authored document says so (matrix 25)', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({ currentMapId: 'c-1', authoredDocument: null })

    render(<PanoramaManagementPage />)

    expect(await screen.findByText('This campus has no authored dataset yet.')).toBeTruthy()
  })

  it('E — a campus whose document has zero panoramas (matrix 22)', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', []) })

    render(<PanoramaManagementPage />)

    expect(
      await screen.findByText('No Virtual Tour scenes have been added to this campus yet.'),
    ).toBeTruthy()
  })

  it('B + matrix 26/27 — a load error shows Retry, and Retry re-runs the load path', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    setGraphState({
      currentMapId: 'c-1',
      authoredDocument: makeDoc('c-1', [PANO_A]),
      syncStatus: 'error',
      syncError: 'Campus could not be read.',
    })

    render(<PanoramaManagementPage />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Campus could not be read.')

    const loadSpy = vi.spyOn(useGraphStore.getState(), 'loadMapData')
    alert.querySelector('button')?.click()

    await waitFor(() => expect(loadSpy).toHaveBeenCalledWith('c-1'))
    loadSpy.mockRestore()
  })
})

// ── Legacy isolation (STEP 27) ─────────────────────────────────────────────

/**
 * Build a graph snapshot carrying exactly the legacy data PM-3 must ignore:
 * `hasPanorama` nodes and an inline `metadata.panoramaUrl` data URL.
 */
function legacyGraphSnapshot(campusId: string, nodeCount: number) {
  return {
    id: `g-${campusId}`,
    campusId,
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    buildings: [],
    components: [],
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `N-legacy-${i}`,
      label: `Legacy Panorama ${i}`,
      name: `Legacy Panorama ${i}`,
      type: 'intersection',
      position: { lat: 5 + i, lng: 6 + i },
      campusId,
      hasPanorama: true,
      metadata: { panoramaUrl: `data:image/png;base64,AAAA${i}`, panoramaId: `p-legacy-${i}` },
    })),
    edges: [],
    traces: [],
    areas: [],
    pois: [],
  }
}

describe('legacy graph panorama data is ignored', () => {
  it('matrix 2 — legacy hasPanorama/panoramaUrl nodes produce ZERO cards', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    // Authored document present but with NO panoramas — the canonical truth.
    useGraphStore.setState({
      currentMapId: 'c-1',
      authoredDocument: makeDoc('c-1', []),
      graph: Graph.fromJSON(legacyGraphSnapshot('c-1', 2) as never),
      syncStatus: 'synced',
      syncError: null,
    })

    render(<PanoramaManagementPage />)

    expect(
      await screen.findByText('No Virtual Tour scenes have been added to this campus yet.'),
    ).toBeTruthy()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Showing 0 of 0 scenes')).toBeTruthy()
    // Legacy base64 must not leak into the UI.
    expect(document.body.innerHTML).not.toContain('data:image')
    expect(screen.queryByText(/legacy panorama/i)).toBeNull()
  })

  it('matrix 3 — canonical panoramas render even with zero panorama graph nodes', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    useGraphStore.setState({
      currentMapId: 'c-1',
      authoredDocument: makeDoc('c-1', [PANO_A]),
      graph: Graph.fromJSON({ ...legacyGraphSnapshot('c-1', 0), nodes: [] } as never),
      syncStatus: 'synced',
      syncError: null,
    })

    render(<PanoramaManagementPage />)

    expect(await screen.findByRole('button', { name: 'Select scene Alpha Scene' })).toBeTruthy()
  })

  it('matrix 4 — graph topology cannot change the Panorama count', async () => {
    searchParams = new URLSearchParams('campus=c-1')
    useGraphStore.setState({
      currentMapId: 'c-1',
      authoredDocument: makeDoc('c-1', [PANO_A, PANO_B]),
      graph: Graph.fromJSON(legacyGraphSnapshot('c-1', 25) as never),
      syncStatus: 'synced',
      syncError: null,
    })

    render(<PanoramaManagementPage />)

    await screen.findByRole('button', { name: 'Select scene Alpha Scene' })
    expect(screen.getAllByRole('button', { name: /^Select scene / })).toHaveLength(2)
    expect(screen.getByText('Showing 2 of 2 scenes')).toBeTruthy()
  })
})

describe('Studio authoring route and read-only management', () => {
  it('links the selected campus to Studio and does not expose panorama upload controls', async () => {
    searchParams = new URLSearchParams('campus=c-1&pano=p-a')
    setGraphState({ currentMapId: 'c-1', authoredDocument: makeDoc('c-1', [PANO_A]) })

    render(<PanoramaManagementPage />)

    const editLink = await screen.findByRole('link', { name: 'Edit Scenes in Studio' })
    expect(editLink).toHaveAttribute('href', '/studio/c-1/edit')
    expect(screen.queryByLabelText(/upload panorama/i)).toBeNull()
    expect(document.body.innerHTML).not.toContain('data:image')
  })
})
