import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NavigationProvider } from '@/components/map/NavigationContext'
import { usePublicStore } from '@/store/public-store'
import { buildFromCampusBundle } from '@/components/map/NavigationRenderModel'
import type { CampusBundle } from '@/types/nav-types'
import type { NavRoute } from '@/types/route-types'
import ExploreMap from '../ExploreMap'

const navigationCameraProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
const routeLineProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('@/components/map/NavigationMap', () => ({
  default: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => {
    navigationCameraProps.current = props
    return <div data-testid="navigation-map">{children}</div>
  },
  useNavigationMap: () => ({ map: null }),
}))

vi.mock('@/components/map/NavigationCamera', () => ({
  default: (props: { surface: string; mode: string }) => (
    <output data-testid="navigation-camera" data-surface={props.surface} data-mode={props.mode} />
  ),
}))

vi.mock('@/components/map/RouteLine', () => ({
  RouteLine: (props: Record<string, unknown>) => {
    routeLineProps.current = props
    return null
  },
}))

vi.mock('@/components/map/FloorSelector', () => ({
  FloorSelector: ({ floors, activeFloor }: { floors: number[]; activeFloor: number }) => floors.length > 1 ? (
    <output
      data-testid="explore-floor-selector"
      data-floors={floors.join(',')}
      data-active-floor={String(activeFloor)}
    />
  ) : null,
}))

vi.mock('@/components/map/layers/BuildingLayer', () => ({
  BuildingLayer: ({ selectedBuildingId }: { selectedBuildingId?: string }) => (
    <output data-testid="building-layer-selection" data-selected-building={selectedBuildingId ?? ''} />
  ),
}))

vi.mock('@/components/map/NavigationRenderModel', () => ({
  buildFromCampusBundle: vi.fn(() => ({
    buildings: [],
    entrances: [],
    indoor: {
      rooms: [],
      hallways: [],
      walls: [],
      stairs: [],
      elevators: [],
      doors: [],
      openings: [],
      pois: [],
    },
  })),
}))

vi.mock('@/components/map/layers/RoomLayer', () => ({
  RoomLayer: ({ indoorContext }: { indoorContext?: { active: boolean; buildingId?: string; floorId?: number } }) => (
    <output
      data-testid="room-layer-context"
      data-active={String(indoorContext?.active ?? false)}
      data-building={indoorContext?.buildingId ?? ''}
      data-floor={String(indoorContext?.floorId ?? '')}
    />
  ),
}))

const route: NavRoute = {
  path: ['outdoor', 'entry-3f'],
  steps: [
    {
      nodeId: 'outdoor',
      label: 'Outside',
      position: { lat: 11.82, lng: 122.168 },
      floor: 0,
      buildingId: '',
      type: 'walk',
    },
    {
      nodeId: 'entry-3f',
      label: '3F Entrance',
      position: { lat: 11.821, lng: 122.168 },
      floor: 3,
      buildingId: 'b1',
      type: 'entrance',
    },
  ],
  instructions: [],
  totalDistance: 10,
  totalDuration: 0,
  fromLabel: 'Outside',
  toLabel: '3F Entrance',
  arrival: {
    nodeId: 'entry-3f',
    label: '3F Entrance',
    position: { lat: 11.821, lng: 122.168 },
    remainingDistance: 0,
  },
  nodeFloors: [3, 0],
}

const bundle = {
  nodes: [],
  edges: [],
  searchEntries: [],
  buildings: [],
  components: [],
  poi: [],
  boundingBox: null,
  floorGeometry: { schemaVersion: 1 } as unknown as CampusBundle['floorGeometry'],
} satisfies CampusBundle

afterEach(() => {
  cleanup()
  usePublicStore.setState({
    campus: null,
    selectedBuilding: null,
    indoorContext: { active: false },
    activeFloor: 0,
  })
  vi.clearAllMocks()
  routeLineProps.current = null
})

const buildingBundle = {
  ...bundle,
  floorGeometry: undefined,
  buildings: [{
    id: 'b1',
    name: 'Library',
    campusId: 'campus-1',
    floors: [1, 2, 3],
    footprint: [
      { lat: 11.82, lng: 122.168 },
      { lat: 11.821, lng: 122.168 },
      { lat: 11.821, lng: 122.169 },
    ],
    baseElevation: 0,
    height: 12,
  }],
} satisfies CampusBundle

describe('ExploreMap public navigation context boundary', () => {
  it('keeps the parent live context and passes indoor context/floorGeometry to layers', () => {
    usePublicStore.setState({
      indoorContext: { active: true, buildingId: 'b1', floorId: 3 },
      activeFloor: 3,
    })

    render(
      <NavigationProvider
        route={route}
        currentNodeId="entry-3f"
        buildingId="b1"
        floor={3}
        location={{ lat: 11.821, lng: 122.168 }}
      >
        <ExploreMap bundle={bundle} route={{ path: route.path, cost: route.totalDistance }} />
      </NavigationProvider>,
    )

    expect(document.querySelector('[data-nav-segment]')?.getAttribute('data-nav-segment')).toBe('entrance')
    expect(screen.getByTestId('room-layer-context')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('room-layer-context')).toHaveAttribute('data-building', 'b1')
    expect(screen.getByTestId('room-layer-context')).toHaveAttribute('data-floor', '3')
    expect(screen.queryByTestId('explore-floor-selector')).toBeNull()
    expect(vi.mocked(buildFromCampusBundle)).toHaveBeenCalledWith(expect.objectContaining({
      floorGeometry: bundle.floorGeometry,
    }))
  })

  it('does not render a permanent floor selector outdoors', () => {
    usePublicStore.setState({ campus: buildingBundle, activeFloor: 3 })

    render(<ExploreMap bundle={buildingBundle} />)

    expect(screen.queryByTestId('explore-floor-selector')).toBeNull()
  })

  it('renders only the selected building floors in building context', () => {
    const selectedBuilding = buildingBundle.buildings[0]
    usePublicStore.setState({
      campus: buildingBundle,
      selectedBuilding,
      indoorContext: { active: true, buildingId: 'b1', floorId: 2 },
      activeFloor: 2,
    })

    render(<ExploreMap bundle={buildingBundle} />)

    expect(screen.getByTestId('explore-floor-selector')).toHaveAttribute('data-floors', '3,2,1')
    expect(screen.getByTestId('explore-floor-selector')).toHaveAttribute('data-active-floor', '2')
    expect(screen.getByTestId('building-layer-selection')).toHaveAttribute('data-selected-building', 'b1')
  })

  it('emphasizes a route target building without activating its indoor context', () => {
    usePublicStore.setState({
      campus: buildingBundle,
      selectedBuilding: null,
      indoorContext: { active: false },
      activeFloor: 0,
    })

    render(<ExploreMap bundle={buildingBundle} navigationTargetBuildingId="b1" />)

    expect(screen.getByTestId('building-layer-selection')).toHaveAttribute('data-selected-building', 'b1')
    expect(screen.getByTestId('room-layer-context')).toHaveAttribute('data-active', 'false')
    expect(usePublicStore.getState().indoorContext.active).toBe(false)
  })

  it('passes an absent floorGeometry artifact through safely', () => {
    render(<ExploreMap bundle={buildingBundle} />)

    expect(vi.mocked(buildFromCampusBundle)).toHaveBeenCalledWith(expect.objectContaining({
      floorGeometry: undefined,
    }))
  })

  it('exposes only the minimal map controls', () => {
    render(<ExploreMap bundle={buildingBundle} />)

    expect(screen.getByRole('button', { name: 'Recenter map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset map view' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voice guidance' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fit route' })).toBeNull()
  })

  it('keeps legacy Explore controls when no camera configuration is supplied', () => {
    render(<ExploreMap bundle={buildingBundle} />)

    expect(screen.queryByTestId('navigation-camera')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset map view' })).toBeInTheDocument()
  })

  it('uses the canonical camera seam and suppresses duplicate legacy controls when configured', () => {
    render(
      <ExploreMap
        bundle={buildingBundle}
        camera={{
          surface: 'active',
          mode: 'FOLLOW',
          position: [122.168, 11.82],
          heading: 90,
          routeBounds: { minLng: 122.168, maxLng: 122.169, minLat: 11.82, maxLat: 11.821 },
          showControls: true,
        }}
      />,
    )

    expect(screen.getByTestId('navigation-camera')).toHaveAttribute('data-surface', 'active')
    expect(screen.queryByRole('button', { name: 'Reset map view' })).toBeNull()
    expect(navigationCameraProps.current).toMatchObject({ fitBoundsOnChange: false })
    expect(routeLineProps.current).toMatchObject({ fitCamera: false })
    expect(navigationCameraProps.current).toMatchObject({ maxPitch: 85 })
  })

  it('does not let campus bounds override an active camera with a live position', () => {
    render(
      <ExploreMap
        bundle={buildingBundle}
        camera={{
          surface: 'active',
          mode: 'TOP',
          position: [122.168, 11.82],
          showControls: true,
        }}
      />,
    )

    expect(navigationCameraProps.current).toMatchObject({ fitBoundsOnChange: false })
  })

  it('keeps campus bounds as the safe fallback until an active camera has a position', () => {
    render(
      <ExploreMap
        bundle={buildingBundle}
        camera={{
          surface: 'active',
          mode: 'TOP',
          showControls: true,
        }}
      />,
    )

    expect(navigationCameraProps.current).toMatchObject({ fitBoundsOnChange: true })
  })
})
