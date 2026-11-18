'use client'

import { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import NavigationMap, { useNavigationMap } from '@/components/map/NavigationMap'
import { BuildingLayer } from '@/components/map/layers/BuildingLayer'
import { RoomLayer } from '@/components/map/layers/RoomLayer'
import { HallwayLayer } from '@/components/map/layers/HallwayLayer'
import { StaircaseLayer } from '@/components/map/layers/StaircaseLayer'
import { ElevatorLayer } from '@/components/map/layers/ElevatorLayer'
import { DoorLayer } from '@/components/map/layers/DoorLayer'
import { FloorArchitectureLayer, selectFloorArchitecture, floorArchitectureFallback } from '@/components/map/layers/FloorArchitectureLayer'
import { RouteFloorLayer } from '@/components/map/layers/RouteFloorLayer'
import { routeFloorRibbons } from '@/lib/route-floor-ribbons'
import { RaisedRoomLabels } from '@/components/map/layers/RaisedRoomLabels'
import { WallLayer } from '@/components/map/layers/WallLayer'
import { OpeningLayer } from '@/components/map/layers/OpeningLayer'
import { POILayer } from '@/components/map/layers/POILayer'
import { TerrainLayer } from '@/components/map/layers/TerrainLayer'
import { terrainAwareMapBounds } from '@/components/map/layers/terrain-layer-geojson'
import { RouteLine } from '@/components/map/RouteLine'
import { SiteLayers } from '@/components/map/site/SiteLayers'
import { flatSite, routeAsRibbon } from '@/components/map/site/flat-site'
import { TerrainLookSwitch } from '@/components/map/TerrainLookSwitch'
import { autoIndoorDecision } from '@/lib/auto-indoor'
import { buildingFront, focusCamera } from '@/lib/focus-camera'
import { openingBearing } from '@/lib/opening-view'
import { visitorPois, type PublishedPoi } from '@/lib/visitor-pois'
import { DEFAULT_TERRAIN_LOOK, createSiteGround } from '@navi/core'
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
import type { CaptureDirectionSource, CaptureDirectionStatus } from '@/features/capture/direction'
import {
  getExploreFloors,
  resolveExploreBuildingColor,
  resolveExploreContext,
  type ExploreContext,
} from '@/lib/explore-contracts'
import { NAVIGATION_POV_PREFERRED_PITCH } from '@/lib/navigation-camera-policy'

function toCameraHeadingStatus(
  status: CaptureDirectionStatus,
  source: CaptureDirectionSource,
): NavigationCameraConfig['headingStatus'] {
  if (status === 'permission-required' || status === 'denied' || status === 'unsupported') return status
  return source
}

// ── Props ──────────────────────────────────────────────────────

export interface ExploreMapProps {
  bundle: CampusBundle
  /** Optional active route — seam for the Navigate phase (null in Explore). */
  route?: { path: string[]; cost: number; leadIn?: { lat: number; lng: number } | null } | null
  /** Route-backed visual emphasis; does not activate Explore indoor context. */
  navigationTargetBuildingId?: string
  /** The floor the route ends on in that building (owner 2026-11-18): it opens there in 2.5D while you are outside. */
  navigationTargetFloor?: number
  /** Opt-in canonical camera bridge; absent keeps the legacy Explore controls. */
  camera?: NavigationCameraConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function authoredPoiPosition(bundle: CampusBundle, id: string): { lat: number; lng: number } | undefined {
  const poi = bundle.poi.find((value) => isRecord(value) && value.id === id)
  if (!isRecord(poi)) return undefined
  const geometry = isRecord(poi.geometry) ? poi.geometry : undefined
  const candidate = geometry?.type === 'point'
    ? geometry.position
    : geometry?.type === 'circle'
      ? geometry.center
      : Array.isArray(geometry?.points) ? geometry.points[0] : poi.position
  if (!isRecord(candidate) || typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') return undefined
  return { lat: candidate.lat, lng: candidate.lng }
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
  fitCamera,
}: {
  model: NavigationRenderModel
  bundle: CampusBundle
  route?: { path: string[]; cost: number; leadIn?: { lat: number; lng: number } | null } | null
  indoorContext: { active: boolean; buildingId?: string; floorId?: number }
  activeFloor: number
  selectedBuildingId?: string
  navigationTargetBuildingId?: string
  fitCamera: boolean
}) {
  const { map } = useNavigationMap()
  const selectBuilding = usePublicStore((s) => s.selectBuilding)
  const setSheet = usePublicStore((s) => s.setSheet)
  const revealedPoiIds = usePublicStore((s) => s.revealedPoiIds)
  // Phase 2F foundation: consume the navigation segment so layers never decide
  // navigation state independently. T10: routes emphasize via this segment.
  const { navigationSegment } = useNavigationContext()
  // Task 15: with a published site the map is campus only; tilted (3D) shows its terrain, and the route
  // becomes a ribbon on the surface (2D keeps the route line).
  // Flat ground unless the visitor chose the terrain (owner 2026-11-16: flat for Thursday, terrain as an option).
  const ground = usePublicStore((s) => s.preferences.ground)
  const site = useMemo(() => (ground === 'terrain' ? bundle.site : flatSite(bundle.site)), [bundle.site, ground])
  const terrainLook = usePublicStore((s) => s.preferences.terrainLook)
  const [threeD, setThreeD] = useState(() => (map ? map.getPitch() > 2 : false))
  useEffect(() => {
    if (!map) return
    const onPitch = () => setThreeD(map.getPitch() > 2)
    onPitch()
    map.on('pitch', onPitch)
    return () => { map.off('pitch', onPitch) }
  }, [map])

  // Zooming in on a building opens its floor; zooming back out closes it (only buildings opened this way).
  const autoIndoorRef = useRef<string | null>(null)
  const routeShown = Boolean(route && route.path.length > 0)
  useEffect(() => {
    if (!map || routeShown) return
    const onMoveEnd = () => {
      const { indoorContext: current, enterIndoorContext, exitIndoorContext } = usePublicStore.getState()
      const open = current.active && current.buildingId ? current.buildingId : null
      if (open !== autoIndoorRef.current) autoIndoorRef.current = null
      const decision = autoIndoorDecision({
        buildings: model.buildings,
        center: map.getCenter(),
        zoom: map.getZoom(),
        indoor: open ? { buildingId: open, auto: autoIndoorRef.current === open } : null,
      })
      if (!decision) return
      if ('exit' in decision) {
        autoIndoorRef.current = null
        exitIndoorContext()
        return
      }
      const building = bundle.buildings.find((b) => b.id === decision.enter)
      autoIndoorRef.current = decision.enter
      enterIndoorContext(decision.enter, building?.floors?.[0] ?? 0)
      // An open details sheet follows to the new building; a room highlighted in the old one is cleared.
      const state = usePublicStore.getState()
      if (state.focusedRoom && state.focusedRoom.buildingId !== decision.enter) state.focusRoom(null)
      if (building && state.selectedBuilding && state.selectedBuilding.id !== decision.enter) state.selectBuilding(building)
    }
    map.on('moveend', onMoveEnd)
    return () => { map.off('moveend', onMoveEnd) }
  }, [map, model.buildings, bundle.buildings, routeShown])

  const indoorActive = indoorContext.active
  const indoorBuildingId = indoorContext.buildingId
  const architecture = useMemo(
    () => selectFloorArchitecture(model.indoor.architecture, { active: indoorActive, buildingId: indoorBuildingId }, activeFloor, threeD),
    [model.indoor.architecture, indoorActive, indoorBuildingId, activeFloor, threeD],
  )
  // On 3D terrain every wall piece would be lifted by the ground under it (uneven on a slope): level them
  // all to the building's floor.
  const siteGround = useMemo(() => (site?.terrain ? createSiteGround(site) : null), [site])
  const openBuildingId = architecture?.buildingId
  // The open floor's own floor covers the outline and every room on it (no ground shows under it).
  const openFloorAreas = useMemo(() => {
    if (!openBuildingId) return undefined
    const onFloor = <T extends { buildingId: string; floor: number; polygon: { lat: number; lng: number }[] }>(list: T[]) =>
      list.filter((item) => item.buildingId === openBuildingId && item.floor === activeFloor).map((item) => item.polygon)
    const outline = bundle.buildings.find((b) => b.id === openBuildingId)?.footprint ?? []
    return [outline, ...onFloor(model.indoor.rooms)]
  }, [bundle.buildings, openBuildingId, activeFloor, model.indoor.rooms])
  const architectureLevel = useMemo(() => {
    if (!siteGround || !site || !openBuildingId) return undefined
    const published = site.buildings.find((b) => b.id === openBuildingId)?.baseM
    const ring = bundle.buildings.find((b) => b.id === openBuildingId)?.footprint ?? []
    const centre = ring.length ? { lat: ring.reduce((t, p) => t + p.lat, 0) / ring.length, lng: ring.reduce((t, p) => t + p.lng, 0) / ring.length } : null
    const floorM = published ?? (centre ? siteGround(centre) : undefined)
    return floorM === undefined ? undefined : { ground: siteGround, floorM }
  }, [siteGround, site, openBuildingId, bundle.buildings])

  const handleBuildingClick = (buildingId: string) => {
    // Look up the full Building from the bundle (not the render model)
    const building = bundle.buildings.find((b) => b.id === buildingId)
    if (building) {
      selectBuilding(building)
      setSheet('half')
    }
  }

  // Close in on a building picked by tap or from search, above its details sheet and facing its front (its
  // entrance; owner 2026-11-18), close enough that zooming opens its floors. A building selected by zooming in
  // (no sheet opened) keeps the view as it is; a picked room frames itself.
  const pickedBuildingId = usePublicStore((s) => (s.sheetState === 'half' ? s.selectedBuilding?.id ?? null : null))
  useEffect(() => {
    if (!map || !pickedBuildingId || navigationTargetBuildingId) return
    if (usePublicStore.getState().focusedRoom?.buildingId === pickedBuildingId) return
    const building = bundle.buildings.find((b) => b.id === pickedBuildingId)
    const camera = building ? focusCamera(building.footprint ?? [], { width: map.getContainer().clientWidth, height: map.getContainer().clientHeight }, 'building', buildingFront(bundle.nodes, building.id)) : null
    if (camera) map.fitBounds(camera.bounds, camera.options)
  }, [map, pickedBuildingId, navigationTargetBuildingId, bundle.buildings, bundle.nodes])

  // Authored POIs: outdoor ones always, the open building's on the floor shown (hidden ones stay off the map
  // unless a search reveals them).
  const visiblePois = useMemo(() => {
    const indoor = { active: indoorContext.active, buildingId: indoorContext.buildingId }
    const floorPois = indoor.active ? model.indoor.pois.filter((p) => p.buildingId === indoor.buildingId && p.floor === activeFloor) : []
    return [...visitorPois(bundle.poi as PublishedPoi[] | undefined, indoor, activeFloor), ...floorPois]
  }, [bundle.poi, indoorContext.active, indoorContext.buildingId, activeFloor, model.indoor.pois])

  // A room picked from a building's room list or search: go to it, and highlight it on its floor.
  const focusedRoom = usePublicStore((s) => s.focusedRoom)
  const focusedRoomShape = useMemo(() => {
    if (!focusedRoom) return null
    const room = model.indoor.rooms.find((r) => r.id === focusedRoom.roomId && r.buildingId === focusedRoom.buildingId)
    if (!room) return null
    const record = model.indoor.architecture?.find((a) => a.buildingId === room.buildingId && a.floor === room.floor)
    return { room, elevation: record?.elevation ?? 0 }
  }, [focusedRoom, model.indoor.rooms, model.indoor.architecture])
  useEffect(() => {
    if (!map || !focusedRoomShape) return
    const camera = focusCamera(focusedRoomShape.room.polygon, { width: map.getContainer().clientWidth, height: map.getContainer().clientHeight }, 'room', buildingFront(bundle.nodes, focusedRoomShape.room.buildingId))
    if (camera) map.fitBounds(camera.bounds, camera.options)
  }, [map, focusedRoomShape, bundle.nodes])
  // Room names of the floor open in 2.5D, placed over the raised floor (not on the ground under it).
  const openFloorRooms = useMemo(
    () => (openBuildingId ? model.indoor.rooms.filter((r) => r.buildingId === openBuildingId && r.floor === activeFloor) : null),
    [model.indoor.rooms, openBuildingId, activeFloor],
  )
  const openFloorSurfaceM = (architectureLevel?.floorM ?? 0) + (architecture?.elevation ?? 0) + 0.3
  const roomHighlight = useMemo(
    () => (focusedRoomShape && focusedRoomShape.room.floor === activeFloor && indoorContext.active && indoorContext.buildingId === focusedRoomShape.room.buildingId
      ? { ring: focusedRoomShape.room.polygon, elevation: focusedRoomShape.elevation }
      : undefined),
    [focusedRoomShape, activeFloor, indoorContext.active, indoorContext.buildingId],
  )

  // Node lookup for route rendering (seam for the Navigate phase).
  const getNodePosition = useCallback(
    (id: string) => {
      const n = bundle.nodes.find((x) => x.id === id)
      return n ? { lat: n.position.lat, lng: n.position.lng } : authoredPoiPosition(bundle, id)
    },
    [bundle],
  )
  // While a route is shown (owner 2026-11-18: "filter out the names … so we can focus on our navigation"): only the
  // destination building is named, and other places are hidden (a place the route ends at stays).
  const navigating = Boolean(route && (route.path.length > 0 || route.leadIn))
  const routeEnd = route?.path.at(-1)
  const routePois = useMemo(
    () => (navigating ? visiblePois.filter((poi) => poi.id === routeEnd || (poi as { sourceId?: string }).sourceId === routeEnd) : visiblePois),
    [navigating, visiblePois, routeEnd],
  )
  const getNodeBuilding = useCallback((id: string) => bundle.nodes.find((x) => x.id === id)?.buildingId, [bundle.nodes])
  // The route lying on the 2.5D floors (owner 2026-11-18: "it should show on the floor"), for the open building's
  // floors up to the one shown.
  const routeOnFloors = useMemo(() => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    if (!route || !architecture) return empty
    const elevations = new Map<number, number>()
    for (const record of model.indoor.architecture ?? []) {
      if (record.buildingId === architecture.buildingId) elevations.set(record.floor, Number.isFinite(record.elevation) ? record.elevation : 0)
    }
    return routeFloorRibbons({
      path: route.path,
      node: (id) => {
        const n = bundle.nodes.find((x) => x.id === id)
        return n ? { lat: n.position.lat, lng: n.position.lng, floor: n.floor, buildingId: n.buildingId } : undefined
      },
      buildingId: architecture.buildingId,
      elevations,
      topFloor: activeFloor,
    })
  }, [route, architecture, model.indoor.architecture, bundle.nodes, activeFloor])
  // The route's points for the 3D ribbon.
  const routePath = useMemo(
    () => [...(route?.leadIn ? [route.leadIn] : []), ...(route?.path ?? []).map(getNodePosition).filter((p): p is { lat: number; lng: number } => Boolean(p))],
    [route, getNodePosition],
  )
  const getNodeFloor = useCallback(
    (id: string) => {
      const node = bundle.nodes.find((x) => x.id === id)
      if (node) return node.floor
      const poi = bundle.poi.find((value) => isRecord(value) && value.id === id)
      return isRecord(poi) && typeof poi.floor === 'number' ? poi.floor : undefined
    },
    [bundle],
  )

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-nav-segment={navigationSegment} data-terrain-area-count={bundle.terrainAreas?.length ?? 0}>
      <TerrainLayer map={map} areas={bundle.terrainAreas} datum={bundle.terrainVerticalDatum} />
      <BuildingLayer
        map={map}
        buildings={model.buildings}
        selectedBuildingId={navigationTargetBuildingId ?? selectedBuildingId}
        onBuildingClick={handleBuildingClick}
        solid={Boolean(site)}
        labelsFor={navigating ? navigationTargetBuildingId ?? null : undefined}
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
      <FloorArchitectureLayer map={map} architecture={architecture} level={threeD ? architectureLevel : undefined} floorAreas={openFloorAreas} highlight={roomHighlight} />
      <RouteFloorLayer map={map} data={routeOnFloors} />
      <RaisedRoomLabels map={map} rooms={openFloorRooms} surfaceM={openFloorSurfaceM} />
      <WallLayer
        map={map}
        walls={floorArchitectureFallback(model.indoor.walls, architecture, 'walls')}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <StaircaseLayer
        map={map}
        stairs={floorArchitectureFallback(model.indoor.stairs, architecture, 'stairs')}
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
        doors={floorArchitectureFallback(model.indoor.doors, architecture, 'doors')}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      <OpeningLayer
        map={map}
        openings={floorArchitectureFallback(model.indoor.openings, architecture, 'openings')}
        walls={model.indoor.walls}
        floor={activeFloor}
        indoorContext={indoorContext}
      />
      {/* No entrance markers for visitors (owner 2026-11-18: the green house glyphs read as clutter). Entrances still
          route; the admin Route Testing page keeps its markers. */}
      <POILayer
        map={map}
        pois={routePois}
        revealedIds={revealedPoiIds}
      />
      <RouteLine
        map={map}
        // On flat ground the bold route line stays when tilted; on terrain the route is a ribbon on the surface.
        route={routeAsRibbon(site, threeD) ? null : route ?? null}
        getNodePosition={getNodePosition}
        getNodeFloor={getNodeFloor}
        getNodeBuilding={getNodeBuilding}
        activeFloor={activeFloor}
        navigationSegment={navigationSegment}
        fitCamera={fitCamera}
      />
      {/* Last on purpose: the app's layers set up only on a loaded style, and the site's terrain tiles
          would keep it "loading". The site layers insert themselves underneath the app's layers. */}
      {site && (
        <SiteLayers map={map} site={site} buildings={bundle.buildings} threeD={threeD} contours={false} routePath={routeAsRibbon(site, threeD) ? routePath : null} look={terrainLook} />
      )}
    </div>
  )
}

// ── Floor selector ─────────────────────────────────────────────

function ExploreFloorSelector({
  bundle,
  context,
  activeFloor,
  viewedFloorId,
}: {
  bundle: CampusBundle
  context: ExploreContext
  activeFloor: number
  viewedFloorId: number | null
}) {
  const setViewedFloor = usePublicStore((s) => s.setViewedFloor)
  const setPositionFloorManually = usePublicStore((s) => s.setPositionFloorManually)

  const floors = useMemo(() => {
    if (!context.buildingId) return []
    const publishedFloors = getExploreFloors(bundle, context.buildingId)
    const routeFloors = context.surface === 'active-navigation'
      ? context.routeFloors.filter((floor) => publishedFloors.includes(floor))
      : []
    return [...new Set([...publishedFloors, ...routeFloors])].sort((a, b) => b - a)
  }, [bundle, context.buildingId, context.routeFloors, context.surface])

  if (!context.indoorActive || !context.buildingId) return null

  return (
    <FloorSelector
      floors={floors}
      activeFloor={viewedFloorId ?? activeFloor}
      onChange={setViewedFloor}
      onConfirmFloor={(floor) => setPositionFloorManually(floor, context.buildingId!)}
    />
  )
}

/** Explore keeps only the terrain look switch (owner 2026-11-18: no camera buttons; pinch and drag move the map). */
function ExploreMapControls({ site }: { site?: CampusBundle['site'] }) {
  const terrainLook = usePublicStore((s) => s.preferences.terrainLook)
  const setTerrainLook = usePublicStore((s) => s.setTerrainLook)
  const campusLook = site?.look ?? DEFAULT_TERRAIN_LOOK
  if (!site?.terrain) return null
  return (
    <div className="absolute right-4 top-20 z-20 flex flex-col gap-2">
      <TerrainLookSwitch active={terrainLook ?? campusLook} campusDefault={campusLook} onChange={setTerrainLook} />
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
export default function ExploreMap({ bundle, route, navigationTargetBuildingId, navigationTargetFloor, camera }: ExploreMapProps) {
  // Build render model from bundle (memoized)
  const mapAppearance = usePublicStore((s) => s.preferences.mapAppearance)
  // Flat ground unless the visitor chose the terrain (owner 2026-11-16).
  const preferredGround = usePublicStore((s) => s.preferences.ground)
  const shownSite = useMemo(() => (preferredGround === 'terrain' ? bundle.site : flatSite(bundle.site)), [bundle.site, preferredGround])
  const mapBounds = useMemo(
    () => terrainAwareMapBounds(bundle.boundingBox, bundle.terrainAreas ?? []),
    [bundle.boundingBox, bundle.terrainAreas],
  )
  // Open entrance-first, in portrait (owner 2026-11-18): the Entrance Gate at the bottom, the campus running up.
  const entranceFirst = useMemo(
    () => {
      const box = bundle.boundingBox
      const corners = box ? [{ lat: box.minLat, lng: box.minLng }, { lat: box.minLat, lng: box.maxLng }, { lat: box.maxLat, lng: box.maxLng }, { lat: box.maxLat, lng: box.minLng }] : []
      return openingBearing(bundle.poi ?? [], bundle.site?.boundary?.length ? bundle.site.boundary : corners)
    },
    [bundle.poi, bundle.boundingBox, bundle.site],
  )
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
  const viewedFloorId = usePublicStore((s) => s.viewedFloorId)
  const indoorContext = usePublicStore((s) => s.indoorContext)
  const parentNavigationContext = useOptionalNavigationContext()
  const exploreContext = useMemo(
    () => resolveExploreContext({
      parentContext: parentNavigationContext,
      selectedBuildingId: selectedBuilding?.id,
      indoorContext,
      activeFloor,
      navigationTarget: navigationTargetBuildingId && navigationTargetFloor !== undefined ? { buildingId: navigationTargetBuildingId, floor: navigationTargetFloor } : null,
    }),
    [activeFloor, indoorContext, parentNavigationContext, selectedBuilding?.id, navigationTargetBuildingId, navigationTargetFloor],
  )
  const effectiveFloor = viewedFloorId ?? exploreContext.floor ?? activeFloor
  const effectiveIndoorContext = exploreContext.surface === 'outdoors'
    ? { active: false }
    : {
        active: exploreContext.indoorActive,
        buildingId: exploreContext.buildingId,
        floorId: effectiveFloor,
      }

  const cameraWithContext: NavigationCameraConfig | undefined = camera && parentNavigationContext
    ? {
        ...camera,
        heading: camera.heading ?? parentNavigationContext.heading,
        headingStatus: camera.headingStatus ?? toCameraHeadingStatus(
          parentNavigationContext.headingStatus,
          parentNavigationContext.headingSource,
        ),
        canRequestHeadingPermission: camera.canRequestHeadingPermission
          ?? parentNavigationContext.canRequestHeadingPermission,
        onRequestHeadingPermission: camera.onRequestHeadingPermission
          ?? (() => { void parentNavigationContext.enableHeading() }),
      }
    : camera

  const hasLiveCameraPosition = Boolean(
    cameraWithContext?.position
    && Number.isFinite(cameraWithContext.position[0])
    && Number.isFinite(cameraWithContext.position[1]),
  ) || Boolean(
    parentNavigationContext?.location
    && Number.isFinite(parentNavigationContext.location.lat)
    && Number.isFinite(parentNavigationContext.location.lng),
  )

  const layers = (
    <ExploreLayers
      model={model}
      bundle={bundle}
      route={route}
      indoorContext={effectiveIndoorContext}
      activeFloor={effectiveFloor}
      selectedBuildingId={exploreContext.buildingId}
      navigationTargetBuildingId={navigationTargetBuildingId}
      fitCamera={!camera}
    />
  )

  const initialPitch = camera?.mode === 'POV'
    ? NAVIGATION_POV_PREFERRED_PITCH
    : camera?.mode === 'FOLLOW' ? 55 : 0

  return (
    <NavigationMap
      bounds={mapBounds}
      bearing={entranceFirst}
      site={shownSite ?? null}
      className="h-full w-full"
      pitch={initialPitch}
      maxPitch={camera ? NAVIGATION_POV_PREFERRED_PITCH : undefined}
      showZoomControls={false}
      fitBoundsOnChange={camera?.surface === 'explore'
        || !camera
        || (camera?.surface === 'active' && !camera.routeBounds && !hasLiveCameraPosition)}
    >
      {parentNavigationContext ? layers : (
        <NavigationProvider buildingId={exploreContext.buildingId} floor={effectiveFloor}>
          {layers}
        </NavigationProvider>
      )}
      {cameraWithContext ? (
        <NavigationCamera
          {...cameraWithContext}
          restBearing={cameraWithContext.restBearing ?? entranceFirst}
        />
      ) : <ExploreMapControls site={shownSite} />}
      <NavigationPositionMarker />
      <ExploreFloorSelector bundle={bundle} context={exploreContext} activeFloor={activeFloor} viewedFloorId={viewedFloorId} />
    </NavigationMap>
  )
}
