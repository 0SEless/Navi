'use client'

import { useMemo, useCallback, useState } from 'react'
import { Compass, LocateFixed, Navigation } from 'lucide-react'
import NavigationMap, { useNavigationMap } from '@/components/map/NavigationMap'
import { BuildingLayer } from '@/components/map/layers/BuildingLayer'
import { RoomLayer } from '@/components/map/layers/RoomLayer'
import { HallwayLayer } from '@/components/map/layers/HallwayLayer'
import { StaircaseLayer } from '@/components/map/layers/StaircaseLayer'
import { ElevatorLayer } from '@/components/map/layers/ElevatorLayer'
import { DoorLayer } from '@/components/map/layers/DoorLayer'
import { WallLayer } from '@/components/map/layers/WallLayer'
import { OpeningLayer } from '@/components/map/layers/OpeningLayer'
import { EntranceLayer } from '@/components/map/layers/EntranceLayer'
import { POILayer } from '@/components/map/layers/POILayer'
import { RouteLine } from '@/components/map/RouteLine'
import { FloorSelector } from '@/components/map/FloorSelector'
import NavigationCamera, { type NavigationCameraConfig } from '@/components/map/NavigationCamera'
import NavigationPositionMarker from '@/components/map/NavigationPositionMarker'
import {
  NavigationProvider,
  useNavigationContext,
  useOptionalNavigationContext,
} from '@/components/map/NavigationContext'
import { buildFromCampusBundle, type NavigationRenderModel } from '@/components/map/NavigationRenderModel'
import { usePublicStore } from '@/store/public-store'
import type { CampusBundle } from '@/types/nav-types'
import {
  getExploreFloors,
  resolveExploreBuildingColor,
  resolveExploreContext,
  type ExploreContext,
} from '@/lib/explore-contracts'

// ── Props ──────────────────────────────────────────────────────

export interface ExploreMapProps {
  bundle: CampusBundle
  /** Optional active route — seam for the Navigate phase (null in Explore). */
  route?: { path: string[]; cost: number } | null
  /** Route-backed visual emphasis; does not activate Explore indoor context. */
  navigationTargetBuildingId?: string
  /** Opt-in canonical camera bridge; absent keeps the legacy Explore controls. */
  camera?: NavigationCameraConfig
}

// ── Inner layer composition ────────────────────────────────────

/**
 * Renders all map layers. Must be inside NavigationMap (uses useNavigationMap).
 * Separated so layers only mount after the map is ready.
 */
function ExploreLayers({
  model,
  bundle,
  route,
  indoorContext,
  activeFloor,
  selectedBuildingId,
  navigationTargetBuildingId,
}: {
  model: NavigationRenderModel
  bundle: CampusBundle
  route?: { path: string[]; cost: number } | null
  indoorContext: { active: boolean; buildingId?: string; floorId?: number }
  activeFloor: number
  selectedBuildingId?: string
  navigationTargetBuildingId?: string
}) {
  const { map } = useNavigationMap()
  const selectBuilding = usePublicStore((s) => s.selectBuilding)
  const setSheet = usePublicStore((s) => s.setSheet)
  // Phase 2F foundation: consume the navigation segment so layers never decide
  // navigation state independently. T10: routes emphasize via this segment.
  const { navigationSegment } = useNavigationContext()

  const handleBuildingClick = (buildingId: string) => {
    // Look up the full Building from the bundle (not the render model)
    const building = bundle.buildings.find((b) => b.id === buildingId)
    if (building) {
      selectBuilding(building)
      setSheet('half')
    }
  }

  // Node lookup for route rendering (seam for the Navigate phase).
  const getNodePosition = useCallback(
    (id: string) => {
      const n = bundle.nodes.find((x) => x.id === id)
      return n ? { lat: n.position.lat, lng: n.position.lng } : undefined
    },
    [bundle],
  )
  const getNodeFloor = useCallback(
    (id: string) => bundle.nodes.find((x) => x.id === id)?.floor,
    [bundle],
  )

  return (
    <div data-nav-segment={navigationSegment}>
      <BuildingLayer
        map={map}
        buildings={model.buildings}
        selectedBuildingId={navigationTargetBuildingId ?? selectedBuildingId}
        onBuildingClick={handleBuildingClick}
      />
      <RoomLayer
        map={map}
        rooms={model.indoor.rooms}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <HallwayLayer
        map={map}
        hallways={model.indoor.hallways}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <WallLayer
        map={map}
        walls={model.indoor.walls}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <StaircaseLayer
        map={map}
        stairs={model.indoor.stairs}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <ElevatorLayer
        map={map}
        elevators={model.indoor.elevators}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <DoorLayer
        map={map}
        doors={model.indoor.doors}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <OpeningLayer
        map={map}
        openings={model.indoor.openings}
        walls={model.indoor.walls}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <EntranceLayer
        map={map}
        entrances={indoorContext.active
          ? model.entrances.filter(e =>
              e.floor === activeFloor
                && (!indoorContext.buildingId || e.buildingId === indoorContext.buildingId)
            )
          : []}
      />
      <POILayer
        map={map}
        pois={indoorContext.active ? model.indoor.pois : []}
        buildingId={indoorContext.buildingId}
        floor={activeFloor}
      />
      <RouteLine
        map={map}
        route={route ?? null}
        getNodePosition={getNodePosition}
        getNodeFloor={getNodeFloor}
        activeFloor={activeFloor}
        navigationSegment={navigationSegment}
      />
    </div>
  )
}

// ── Floor selector ─────────────────────────────────────────────

function ExploreFloorSelector({
  bundle,
  context,
  activeFloor,
}: {
  bundle: CampusBundle
  context: ExploreContext
  activeFloor: number
}) {
  const setActiveFloor = usePublicStore((s) => s.setActiveFloor)

  const floors = useMemo(() => {
    if (context.surface !== 'building') return []
    return getExploreFloors(bundle, context.buildingId)
  }, [bundle, context.buildingId, context.surface])

  if (context.surface !== 'building' || !context.indoorActive) return null

  return (
    <FloorSelector floors={floors} activeFloor={activeFloor} onChange={setActiveFloor} />
  )
}

function ExploreMapControls({
  bounds,
}: {
  bounds: CampusBundle['boundingBox']
}) {
  const { map } = useNavigationMap()
  const [viewIdx, setViewIdx] = useState(0)

  const cycleView = () => {
    if (!map || !map.isStyleLoaded()) return
    const next = (viewIdx + 1) % 2
    setViewIdx(next)
    if (next === 0) {
      // TOP
      map.easeTo({ pitch: 0, bearing: 0, zoom: Math.max(map.getZoom(), 17), duration: 300 })
    } else {
      // FOLLOW
      map.easeTo({ pitch: 60, duration: 300 })
    }
  }

  const recenter = () => {
    if (!map || !bounds || !map.isStyleLoaded()) return
    map.fitBounds(
      [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
      { padding: 48, duration: 0, maxZoom: 18 },
    )
  }

  const resetView = () => {
    if (!map || !map.isStyleLoaded()) return
    setViewIdx(0)
    map.easeTo({ bearing: 0, pitch: 0, duration: 0 })
  }

  const viewIcons = [
    <span key="top" className="text-[10px] font-bold leading-none">TOP</span>,
    <Navigation key="follow" className="h-4 w-4" aria-hidden="true" />,
  ]

  return (
    <div className="absolute right-4 top-20 z-20 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={cycleView}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--navi-border)] bg-[var(--navi-card)] text-[var(--navi-text)] shadow-lg"
        aria-label="Cycle camera view"
        title="Cycle view"
      >
        {viewIcons[viewIdx]}
      </button>
      <button
        type="button"
        onClick={recenter}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--navi-border)] bg-[var(--navi-card)] text-[var(--navi-text)] shadow-lg"
        aria-label="Recenter map"
        title="Recenter map"
      >
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={resetView}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--navi-border)] bg-[var(--navi-card)] text-[var(--navi-text)] shadow-lg"
        aria-label="Reset map view"
        title="Reset map view"
      >
        <Compass className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

/**
 * Explore campus map — composable architecture using NavigationMap + shared layers.
 *
 * Replaces the legacy public/CampusMap.tsx with the same rendering primitives
 * used by Navigate, ensuring visual consistency across the app.
 *
 * Interaction contract (preserved from legacy):
 *  - hover building → pointer cursor + highlight
 *  - click building → selectBuilding + sheet
 *  - floor selector → filters indoor layers by floor
 */
export default function ExploreMap({ bundle, route, navigationTargetBuildingId, camera }: ExploreMapProps) {
  // Build render model from bundle (memoized)
  const mapAppearance = usePublicStore((s) => s.preferences.mapAppearance)
  const model = useMemo(() => {
    const baseModel = buildFromCampusBundle({
      buildings: bundle.buildings,
      nodes: bundle.nodes,
      edges: bundle.edges,
      boundingBox: bundle.boundingBox,
      components: bundle.components,
      doors: bundle.doors,
      floorGeometry: bundle.floorGeometry,
    })
    return {
      ...baseModel,
      buildings: baseModel.buildings.map((renderBuilding) => {
        const sourceBuilding = bundle.buildings.find(building => building.id === renderBuilding.id)
        return {
          ...renderBuilding,
          color: resolveExploreBuildingColor(
            { color: sourceBuilding?.color ?? renderBuilding.color },
            mapAppearance,
          ),
        }
      }),
    }
  }, [bundle, mapAppearance])

  // Navigation surface owns the context (foundation). Explore proves the
  // state→visualization mechanism; the real Navigate phase supplies live
  // location + route state.
  const selectedBuilding = usePublicStore((s) => s.selectedBuilding)
  const activeFloor = usePublicStore((s) => s.activeFloor)
  const indoorContext = usePublicStore((s) => s.indoorContext)
  const parentNavigationContext = useOptionalNavigationContext()
  const exploreContext = useMemo(
    () => resolveExploreContext({
      parentContext: parentNavigationContext,
      selectedBuildingId: selectedBuilding?.id,
      indoorContext,
      activeFloor,
    }),
    [activeFloor, indoorContext, parentNavigationContext, selectedBuilding?.id],
  )
  const effectiveFloor = exploreContext.floor ?? activeFloor
  const effectiveIndoorContext = exploreContext.surface === 'outdoors'
    ? { active: false }
    : {
        active: exploreContext.indoorActive,
        buildingId: exploreContext.buildingId,
        floorId: effectiveFloor,
      }

  const cameraWithContext = camera && parentNavigationContext
    ? {
        ...camera,
        heading: camera.heading ?? parentNavigationContext.heading,
        headingStatus: camera.headingStatus ?? parentNavigationContext.headingStatus,
        canRequestHeadingPermission: camera.canRequestHeadingPermission
          ?? parentNavigationContext.canRequestHeadingPermission,
        onRequestHeadingPermission: camera.onRequestHeadingPermission
          ?? (() => { void parentNavigationContext.enableHeading() }),
      }
    : camera

  const layers = (
    <ExploreLayers
      model={model}
      bundle={bundle}
      route={route}
      indoorContext={effectiveIndoorContext}
      activeFloor={effectiveFloor}
      selectedBuildingId={exploreContext.buildingId}
      navigationTargetBuildingId={navigationTargetBuildingId}
    />
  )

  const initialPitch = camera?.mode === 'POV' ? 85 : camera?.mode === 'FOLLOW' ? 55 : 0

  return (
    <NavigationMap
      bounds={bundle.boundingBox}
      className="h-full w-full"
      pitch={initialPitch}
      showZoomControls={false}
      fitBoundsOnChange={camera?.surface === 'explore'
        || !camera
        || (camera?.surface === 'active' && !camera.routeBounds)}
    >
      {parentNavigationContext ? layers : (
        <NavigationProvider buildingId={exploreContext.buildingId} floor={effectiveFloor}>
          {layers}
        </NavigationProvider>
      )}
      {cameraWithContext ? (
        <NavigationCamera
          {...cameraWithContext}
        />
      ) : <ExploreMapControls bounds={bundle.boundingBox} />}
      <NavigationPositionMarker />
      <ExploreFloorSelector bundle={bundle} context={exploreContext} activeFloor={activeFloor} />
    </NavigationMap>
  )
}
