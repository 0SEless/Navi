import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type maplibregl from 'maplibre-gl'
import { PREVIEW_LAYER_ID } from '@/lib/three-d/terrain-preview'
import { toLatLng, type CampusDocument, type TerrainGrid } from '@navi/core'
import { TerrainWorkspaceRoute } from '../TerrainWorkspaceRoute'

const counters = vi.hoisted(() => ({
  stage: 0,
  lastStageProps: null as {
    onMainMap?: (m: unknown) => void
    onMiniMap?: (m: unknown) => void
    view?: string
    layers?: { buildings: boolean; roads: boolean; contours: boolean; tracing: boolean }
  } | null,
  driven: [] as unknown[],
  toolsProps: null as { onHeightActive?: (active: boolean) => void; onDraft?: (draft: unknown) => void } | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/studio-v2/client/flag', () => ({ isSaveV2Enabled: () => true }))
vi.mock('@/components/studio/v2/ZoneProvider', () => ({
  ZoneProvider: ({ children }: { children: unknown }) => children,
  useEnsureZone: () => async () => true,
}))
vi.mock('@/components/studio/v2/useStudioSession', () => ({
  useStudioSession: () => null,
  useExplicitSave: () => async () => {},
  useSaveShortcut: () => {},
}))
vi.mock('../useTerrainLock', () => ({ useTerrainLock: () => ({ status: 'held', holderName: null }) }))
vi.mock('../TerrainStage', () => ({
  TerrainStage: (props: {
    onMainMap?: (m: unknown) => void
    onMiniMap?: (m: unknown) => void
    view?: string
    layers?: { buildings: boolean; roads: boolean; contours: boolean; tracing: boolean }
  }) => {
    counters.stage++
    counters.lastStageProps = props
    return null
  },
}))
vi.mock('../TerrainTools', () => ({
  TerrainTools: (props: { onHeightActive?: (active: boolean) => void; onDraft?: (draft: unknown) => void }) => {
    counters.toolsProps = props
    return null
  },
}))

const editorState = vi.hoisted(() => ({ dispatch: undefined as ((command: unknown) => unknown) | undefined }))

vi.mock('@navi/editor', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@navi/editor')
  return {
    ...actual,
    useEditor: () => ({
      document: document,
      services: {
        get: (id: string) =>
          id === 'dispatcher'
            ? { execute: (command: unknown) => editorState.dispatch?.(command) }
            : undefined,
      },
    }),
    useDocumentVersion: () => 1,
  }
})

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => {
  const p = toLatLng(grid, { x, y })
  return { lat: p.lat, lng: p.lng }
}

function documentOf(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(20, 20), ll(100, 20), ll(100, 80), ll(20, 80)] },
    terrain: { reference: { name: 'Sea level', zeroMeaning: 'Mean sea level' }, grid, colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}
const document = documentOf()

interface MockMapEvent {
  lngLat: { lat: number; lng: number }
  originalEvent: { button: number; altKey: boolean; shiftKey: boolean }
  preventDefault(): void
}

type MiniMap = {
  fire(type: string, event?: Partial<MockMapEvent>): void
  added: Array<{ id: string; vertexCount(): number }>
  panState: { disabled: number; enabled: number }
  pitch: { value: number }
  eased: number[]
}

function fakeMap(): maplibregl.Map & MiniMap {
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  const singles = new Map<string, Array<() => void>>()
  const added: Array<{ id: string; vertexCount(): number }> = []
  const pan = { disabled: 0, enabled: 0 }
  const pitch = { value: 0 }
  const eased: number[] = []
  const map = {
    on: (type: string, fn: (event: unknown) => void) => {
      handlers.set(type, (handlers.get(type) ?? []).concat(fn))
    },
    off: (type: string, fn: (event: unknown) => void) => {
      handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn))
    },
    once: (type: string, fn: () => void) => {
      singles.set(type, (singles.get(type) ?? []).concat(fn))
    },
    isStyleLoaded: () => true,
    getSource: () => ({ setData: vi.fn() }),
    addSource: vi.fn(),
    addLayer: (layer: { id: string; vertexCount(): number }) => {
      added.push(layer)
    },
    getLayer: () => undefined,
    removeLayer: () => {},
    getPitch: () => pitch.value,
    easeTo: (options: { pitch: number }) => { eased.push(options.pitch) },
    getCanvas: () => ({ clientWidth: 400, clientHeight: 300 }),
    triggerRepaint: () => {},
    dragPan: {
      disable: () => pan.disabled++,
      enable: () => pan.enabled++,
    },
    fire: (type: string, event?: Partial<MockMapEvent>) => {
      const full: MockMapEvent = {
        lngLat: event?.lngLat ?? ll(40, 40),
        originalEvent: {
          button: event?.originalEvent?.button ?? 0,
          altKey: event?.originalEvent?.altKey ?? false,
          shiftKey: event?.originalEvent?.shiftKey ?? false,
        },
        preventDefault: () => {},
      }
      for (const fn of [...(handlers.get(type) ?? [])]) fn(full)
      for (const fn of [...(singles.get(type) ?? [])]) fn()
    },
  } as unknown as maplibregl.Map & MiniMap
  map.added = added
  map.panState = pan
  map.pitch = pitch
  map.eased = eased
  return map
}

function previewLayer(map: maplibregl.Map & MiniMap): { vertexCount(): number } | undefined {
  return map.added.find((l) => l.id === PREVIEW_LAYER_ID)
}

function flush(): Promise<void> {
  return act(async () => {})
}

describe('TerrainWorkspaceRoute paint preview (section 1)', () => {
  afterEach(() => {
    cleanup()
    editorState.dispatch = undefined
    counters.stage = 0
    counters.lastStageProps = null
    counters.driven = []
  })

  it('a Raise stroke repaints zero stage-level surfaces mid-stroke and at mouseup; it dispatches once and the preview hands off on the map idle', async () => {
    const dispatch = vi.fn(() => ({ success: true }))
    editorState.dispatch = dispatch as unknown as (command: unknown) => unknown
    render(<TerrainWorkspaceRoute mapId="m1" />)
    await flush()
    expect(counters.lastStageProps?.onMainMap).toBeTruthy()
    const map = fakeMap()
    act(() => counters.lastStageProps?.onMainMap?.(map))
    await flush()
    const baseline = counters.stage

    map.fire('mousedown', { lngLat: ll(40, 40) })
    await flush()
    map.fire('mousemove', { lngLat: ll(45, 40) })
    await flush()
    map.fire('mousemove', { lngLat: ll(50, 40) })
    await flush()

    // No React surface re-rendered during painting: same render count as before the stroke began.
    expect(counters.stage).toBe(baseline)
    // The clay preview is on the map with real geometry under the stroke.
    expect(map.added.some((l) => l.id === PREVIEW_LAYER_ID)).toBe(true)
    const layer = previewLayer(map)
    expect(layer?.vertexCount()).toBeGreaterThan(0)

    map.fire('mouseup')
    await flush()

    // Mouseup committed exactly one undo step and still rendered no React surface.
    expect(dispatch).toHaveBeenCalledTimes(1)
    const dispatched = dispatch.mock.calls as unknown as [unknown][]
    expect(dispatched[0]?.[0]).toMatchObject({ id: 'terrain.apply-tiles' })
    expect(counters.stage).toBe(baseline)
    // Handoff: the preview clears on the map's next idle (the committed tiles have landed by then).
    map.fire('idle')
    expect(previewLayer(map)?.vertexCount()).toBe(0)
  })
})

describe('TerrainWorkspaceRoute defaults (section 2)', () => {
  afterEach(() => {
    cleanup()
    editorState.dispatch = undefined
    counters.stage = 0
    counters.lastStageProps = null
  })

  it('opens neutral: the contours view with contour lines on; heights stays one click away', async () => {
    render(<TerrainWorkspaceRoute mapId="m1" />)
    await flush()
    // The opening look is the neutral contours view, and the stage passes it to both maps.
    expect(counters.lastStageProps?.view).toBe('neutral')
    expect(counters.lastStageProps?.layers?.contours).toBe(true)
    // Heights (the colour ramp) is one click away, and the contour lines persist over it.
    act(() => {
      ;(screen.getByRole('button', { name: 'Height' }) as HTMLButtonElement).click()
    })
    await flush()
    expect(counters.lastStageProps?.view).toBe('heights')
    expect(counters.lastStageProps?.layers?.contours).toBe(true)
  })
})

describe('TerrainWorkspaceRoute one map (minimap removed, 2026-11-06)', () => {
  afterEach(() => {
    cleanup()
    editorState.dispatch = undefined
    counters.stage = 0
    counters.lastStageProps = null
  })

  it('offers the stage no mini map; the 3D button tilts the main map and flattens it again', async () => {
    render(<TerrainWorkspaceRoute mapId="m1" />)
    await flush()
    expect(counters.lastStageProps?.onMiniMap).toBeUndefined()
    const main = fakeMap()
    act(() => counters.lastStageProps?.onMainMap?.(main))
    await flush()

    const button = screen.getByRole('button', { name: '3D' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    act(() => (button as HTMLButtonElement).click())
    expect(main.eased).toEqual([60])
    // Tilting by hand (right-drag, pinch) or by the button both report through the map's pitch.
    main.pitch.value = 60
    act(() => main.fire('pitch'))
    await flush()
    expect(screen.getByRole('button', { name: '3D' }).getAttribute('aria-pressed')).toBe('true')
    act(() => (screen.getByRole('button', { name: '3D' }) as HTMLButtonElement).click())
    expect(main.eased).toEqual([60, 0])
  })
})

describe('TerrainWorkspaceRoute height mode (section 3)', () => {
  afterEach(() => {
    cleanup()
    editorState.dispatch = undefined
    counters.stage = 0
    counters.lastStageProps = null
    counters.toolsProps = null
  })

  it('brushes are off while height mode is on, and the draft reaches the map', async () => {
    const dispatch = vi.fn(() => ({ success: true }))
    editorState.dispatch = dispatch as unknown as (command: unknown) => unknown
    render(<TerrainWorkspaceRoute mapId="m1" />)
    await flush()
    const map = fakeMap()
    act(() => counters.lastStageProps?.onMainMap?.(map))
    await flush()
    act(() => counters.toolsProps?.onHeightActive?.(true))
    await flush()

    map.fire('mousedown', { lngLat: ll(40, 40) })
    await flush()
    map.fire('mousemove', { lngLat: ll(50, 40) })
    await flush()
    map.fire('mouseup')
    await flush()
    expect(previewLayer(map)?.vertexCount() ?? 0).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()

    const draft = { buildingBase: { buildingId: 'hall', baseM: 9 } }
    act(() => counters.toolsProps?.onDraft?.(draft))
    await flush()
    expect((counters.lastStageProps as { draft?: unknown } | null)?.draft).toEqual(draft)
  })
})

