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
vi.mock('@/components/map/layers/BuildingLayer', () => ({ BuildingLayer: () => null }))
vi.mock('@/components/map/layers/RoomLayer', () => ({ RoomLayer: () => null }))
vi.mock('@/components/map/layers/HallwayLayer', () => ({ HallwayLayer: () => null }))
vi.mock('@/components/map/layers/WallLayer', () => ({ WallLayer: () => null }))
vi.mock('@/components/map/layers/StaircaseLayer', () => ({ StaircaseLayer: () => null }))
vi.mock('@/components/map/layers/ElevatorLayer', () => ({ ElevatorLayer: () => null }))
vi.mock('@/components/map/layers/DoorLayer', () => ({ DoorLayer: () => null }))
vi.mock('@/components/map/layers/OpeningLayer', () => ({ OpeningLayer: () => null }))
vi.mock('@/components/map/layers/EntranceLayer', () => ({ EntranceLayer: () => null }))
vi.mock('@/components/map/layers/POILayer', () => ({ POILayer: () => null }))
vi.mock('@/components/map/layers/TerrainLayer', () => ({ TerrainLayer: () => null }))
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
    expect(captured.mapProps?.site).toBe(site)
    expect(captured.siteProps).toMatchObject({ site, threeD: false, contours: false })
    expect(captured.routeLine?.route).toEqual(route)
  })

  it('tilting turns on 3D: the route line hides and the route is drawn as a ribbon on the surface', () => {
    render(<ExploreMap bundle={{ ...bundle, site } as never} route={route} />)
    fakeMap.state.pitch = 60
    act(() => fakeMap.fire('pitch'))
    expect(captured.siteProps?.threeD).toBe(true)
    expect(captured.routeLine?.route).toBeNull()
    expect(captured.siteProps?.routePath).toEqual([{ lat: 11.817, lng: 122.17 }, { lat: 11.818, lng: 122.171 }])
  })

  it('without site: no site layers, the map keeps its base map', () => {
    render(<ExploreMap bundle={bundle} route={route} />)
    expect(captured.mapProps?.site ?? null).toBeNull()
    expect(captured.siteProps).toBeNull()
    expect(captured.routeLine?.route).toEqual(route)
  })
})
