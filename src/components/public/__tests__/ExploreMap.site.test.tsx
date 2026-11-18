import { usePublicStore } from '@/store/public-store'
import { flatSite } from '@/components/map/site/flat-site'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { CampusBundle } from '@/types/nav-types'
import ExploreMap from '../ExploreMap'

const captured = vi.hoisted(() => ({
  mapProps: null as Record<string, unknown> | null,
  siteProps: null as Record<string, unknown> | null,
  routeLine: null as Record<string, unknown> | null,
  map: null as unknown,
  entranceLayer: false,
  buildingLayer: null as Record<string, unknown> | null,
  poiLayer: null as Record<string, unknown> | null,
}))

/** A map that reports its pitch and fires 'pitch' to listeners. */
const fakeMap = vi.hoisted(() => {
  const handlers = new Map<string, Array<() => void>>()
  const state = { pitch: 0 }
  return {
    state,
    on(type: string, fn: () => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: () => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string) { for (const fn of handlers.get(type) ?? []) fn() },
    getPitch: () => state.pitch,
    isStyleLoaded: () => true,
    easeTo: () => {},
  }
})

vi.mock('@/components/map/NavigationMap', () => ({
  default: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => {
    captured.mapProps = props
    return <div data-testid="navigation-map">{children}</div>
  },
  useNavigationMap: () => ({ map: fakeMap, isReady: true }),
}))
vi.mock('@/components/map/site/SiteLayers', () => ({
  SiteLayers: (props: Record<string, unknown>) => {
    captured.siteProps = props
    return null
  },
}))
vi.mock('@/components/map/RouteLine', () => ({
  RouteLine: (props: Record<string, unknown>) => {
    captured.routeLine = props
    return null
  },
}))
vi.mock('@/components/map/layers/BuildingLayer', () => ({ BuildingLayer: (props: Record<string, unknown>) => { captured.buildingLayer = props; return null } }))
vi.mock('@/components/map/layers/RoomLayer', () => ({ RoomLayer: () => null }))
vi.mock('@/components/map/layers/HallwayLayer', () => ({ HallwayLayer: () => null }))
vi.mock('@/components/map/layers/WallLayer', () => ({ WallLayer: () => null }))
vi.mock('@/components/map/layers/StaircaseLayer', () => ({ StaircaseLayer: () => null }))
vi.mock('@/components/map/layers/ElevatorLayer', () => ({ ElevatorLayer: () => null }))
vi.mock('@/components/map/layers/DoorLayer', () => ({ DoorLayer: () => null }))
vi.mock('@/components/map/layers/OpeningLayer', () => ({ OpeningLayer: () => null }))
vi.mock('@/components/map/layers/EntranceLayer', () => ({ EntranceLayer: () => { captured.entranceLayer = true; return null } }))
vi.mock('@/components/map/layers/POILayer', () => ({ POILayer: (props: Record<string, unknown>) => { captured.poiLayer = props; return null } }))
vi.mock('@/components/map/layers/TerrainLayer', () => ({ TerrainLayer: () => null }))
vi.mock('@/components/map/layers/FloorArchitectureLayer', async (actual) => ({ ...(await actual<typeof import('@/components/map/layers/FloorArchitectureLayer')>()), FloorArchitectureLayer: () => null }))
vi.mock('@/components/map/FloorSelector', () => ({ FloorSelector: () => null }))
vi.mock('@/components/map/NavigationPositionMarker', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  captured.mapProps = null
  captured.siteProps = null
  captured.routeLine = null
  fakeMap.state.pitch = 0
})

const site = {
  version: 1, terrain: null, roads: [], structures: [], presets: [], buildings: [],
  boundary: [{ lat: 11.8163, lng: 122.169 }, { lat: 11.8163, lng: 122.173 }, { lat: 11.819, lng: 122.173 }],
}

const bundle = {
  nodes: [
    { id: 'a', position: { lat: 11.817, lng: 122.17 }, floor: 0 },
    { id: 'b', position: { lat: 11.818, lng: 122.171 }, floor: 0 },
  ],
  edges: [], searchEntries: [], buildings: [], components: [], poi: [], boundingBox: null,
} as unknown as CampusBundle

const route = { path: ['a', 'b'], cost: 10 }

describe('ExploreMap with a published site (campus only, Task 15)', () => {
  it('with site: the map is campus only and the site layers mount (2D: route line, no ribbon)', () => {
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} />)
    // Flat ground by default (owner 2026-11-16, Thursday): the campus without its terrain.
    expect(captured.mapProps?.site).toEqual(flatSite(site as never))
    expect(captured.siteProps).toMatchObject({ site: flatSite(site as never), threeD: false, contours: false })
    expect(captured.routeLine?.route).toEqual(route)
  })

  it('a visitor who chose the terrain gets the published campus as it is', () => {
    usePublicStore.setState((state) => ({ preferences: { ...state.preferences, ground: 'terrain' } }))
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} />)
    expect(captured.mapProps?.site).toBe(site)
    usePublicStore.setState((state) => { const { ground: _g, ...rest } = state.preferences; return { preferences: rest } })
  })

  it('on flat ground, tilting keeps the bold route line (owner 2026-11-18); no ribbon', () => {
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} />)
    fakeMap.state.pitch = 60
    act(() => fakeMap.fire('pitch'))
    expect(captured.siteProps?.threeD).toBe(true)
    expect(captured.routeLine?.route).toEqual(route)
    expect(captured.siteProps?.routePath ?? null).toBeNull()
  })

  it('draws no entrance markers (the green house glyphs; owner 2026-11-18): entrances stay for routing only', () => {
    captured.entranceLayer = false
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} />)
    expect(captured.entranceLayer).toBe(false)
  })

  it('while a route is shown only the destination building is named and other places are hidden (owner 2026-11-18)', () => {
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} navigationTargetBuildingId="b1" />)
    expect(captured.buildingLayer?.labelsFor).toBe('b1')
    expect(captured.poiLayer?.pois).toEqual([])
    cleanup()
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={null} />)
    expect(captured.buildingLayer?.labelsFor).toBeUndefined()
  })

  it('without site: no site layers, the map keeps its base map', () => {
    render(<ExploreMap bundle={bundle} route={route} />)
    expect(captured.mapProps?.site ?? null).toBeNull()
    expect(captured.siteProps).toBeNull()
    expect(captured.routeLine?.route).toEqual(route)
  })
})
