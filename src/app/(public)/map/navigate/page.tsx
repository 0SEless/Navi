'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Locate,
  MapPin,
  Navigation,
  QrCode,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { usePublicStore } from '@/store/public-store'
import type { CampusBundle, SearchEntry } from '@/types/nav-types'
import { resolveNearestNode } from '@/lib/location-resolver'
import { stripNavigateSessionParameters } from '@/lib/navigation-deep-link'
import { findPublicPoi } from '@/lib/findRoute'
import { defaultStart } from '@/lib/default-start'
import {
  estimatePresentationEtaMinutes,
  formatNavigationDistance,
  getNavigationRouteComposition,
  getNavigationRouteKey,
  resolveNavigationStatus,
  validateNavigationRoute,
} from '@/lib/navigation-experience'
import { QRScanSheet } from '@/components/map/QRScanSheet'
import { NavigationSession } from '@/components/map/NavigationSession'
import { LocationSuggestion } from '@/components/map/LocationSuggestion'
import { useNavigationContext } from '@/components/map/NavigationContext'
import { useNavigationIndoorController } from '@/hooks/useNavigationIndoorController'
import { useQrNavigateDeepLink } from '@/hooks/useQrNavigateDeepLink'
import { remainingRoutePath } from '@/lib/nav-route-helpers'
import { describeDirections, directionAt, directionInstructionType, readablePlaceLabel } from '@/lib/route-directions'
import { GPS_GOOD_ACCURACY_M } from '@/lib/navigation-progress-source'
import type { NavRoute } from '@/types/route-types'
import type { LatLng } from '@/types/nav-types'
import type { QrLocation } from '@/lib/qr-location'
import type { NavigationCameraMode, TopCameraOrientation } from '@/lib/navigation-camera-policy'
import type { NavigationMapView } from '@/lib/public-preferences'

const ExploreMap = dynamic(() => import('@/components/public/ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--navi-text-secondary)]">
      Loading map…
    </div>
  ),
})

function NavigationRouteMap({
  bundle,
  route,
  active,
  navigationTargetBuildingId,
  navigationTargetFloor,
  camera,
}: {
  bundle: CampusBundle
  route: NavRoute | null
  active: boolean
  navigationTargetBuildingId?: string
  navigationTargetFloor?: number
  camera: ComponentProps<typeof ExploreMap>['camera']
}) {
  const { routeProgress } = useNavigationContext()
  const remaining = route ? remainingRoutePath(route, active ? routeProgress : null) : null
  return <ExploreMap
    bundle={bundle}
    route={route && remaining ? { ...remaining, cost: route.totalDistance } : null}
    navigationTargetBuildingId={navigationTargetBuildingId}
    navigationTargetFloor={navigationTargetFloor}
    camera={camera}
  />
}

type PickerRole = 'from' | 'to'

function routeFloorLabel(floor: number | null): string | null {
  if (floor === null) return null
  if (floor === 0) return 'GF'
  return floor > 0 ? `${floor}F` : `B${Math.abs(floor)}F`
}

function cameraModeForPreference(view: NavigationMapView): NavigationCameraMode {
  if (view === 'top') return 'TOP'
  if (view === 'pov') return 'POV'
  return 'FOLLOW'
}

function routeCameraBounds(route: NavRoute | null): {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
} | null {
  const positions = route?.steps
    .map(step => step.position)
    .filter(position => Number.isFinite(position.lat) && Number.isFinite(position.lng)) ?? []
  if (positions.length === 0) return null

  return {
    minLng: Math.min(...positions.map(position => position.lng)),
    maxLng: Math.max(...positions.map(position => position.lng)),
    minLat: Math.min(...positions.map(position => position.lat)),
    maxLat: Math.max(...positions.map(position => position.lat)),
  }
}

function entryForNode(
  campus: NonNullable<ReturnType<typeof usePublicStore.getState>['campus']> | null,
  nodeId: string | null,
): SearchEntry | null {
  if (!campus || !nodeId) return null
  return campus.searchEntries.find((entry) => entry.nodeId === nodeId || entry.id === nodeId) ?? null
}

function entryForPoi(
  campus: NonNullable<ReturnType<typeof usePublicStore.getState>['campus']> | null,
  poiId: string | null,
): SearchEntry | null {
  if (!campus || !poiId) return null
  return campus.searchEntries.find((entry) => entry.id === poiId || entry.sourceId === poiId) ?? null
}

function navigationSegmentLabel(segment: ReturnType<typeof useNavigationContext>['navigationSegment']): string {
  switch (segment) {
    case 'entrance':
      return 'At the selected entrance'
    case 'indoor':
      return 'Indoor route'
    case 'floor-transition':
      return 'Floor transition'
    default:
      return 'Outdoor route'
  }
}

interface ActiveNavigationGuidanceProps {
  route: NavRoute
  destinationLabel: string
  destinationCategory?: string | null
  isPoiDestination?: boolean
  targetBuildingName?: string
  /** A building's display name, for "Enter ..." directions. */
  buildingName?: (buildingId: string) => string | undefined
  destinationFloorLabel: string | null
  onEnd: () => void
  onRecalculate: (location: LatLng | null) => void
}

function ActiveNavigationGuidance({
  route,
  destinationLabel,
  isPoiDestination = false,
  targetBuildingName,
  buildingName,
  destinationFloorLabel,
  onEnd,
  onRecalculate,
}: ActiveNavigationGuidanceProps) {
  const {
    routeProgress,
    isOffRoute,
    arrived,
    geoError,
    navigationSegment,
    progressMode,
    progressLabel,
    gpsLostNotice,
    nextStep,
    previousStep,
    location,
  } = useNavigationContext()
  const preferences = usePublicStore((state) => state.preferences)
  const setNavigationPreferences = usePublicStore((state) => state.setNavigationPreferences)
  const [previewedStep, setPreviewedStep] = useState<number | null>(null)
  const [offRouteDismissed, setOffRouteDismissed] = useState(false)
  useEffect(() => { if (!isOffRoute) setOffRouteDismissed(false) }, [isOffRoute])

  const stepCount = route.steps.length
  const actualStep = routeProgress && stepCount > 0
    ? Math.min(Math.max(Math.floor(routeProgress.index), 0), stepCount - 1)
    : null
  const visibleStep = stepCount > 0
    ? Math.min(Math.max(previewedStep ?? actualStep ?? 0, 0), stepCount - 1)
    : null
  // Readable directions (2026-11-18): a few real steps ("Turn right and walk about 15 m") instead of one per route
  // point ("walk to N-617"); Next/Back move a whole direction.
  const directions = useMemo(() => describeDirections(route, { building: buildingName, destination: destinationLabel }), [route, buildingName, destinationLabel])
  const directionCount = directions.length
  const visibleDirection = visibleStep === null ? null : directionAt(route, visibleStep)
  const actualDirection = actualStep === null ? null : directionAt(route, actualStep)
  const asView = (index: number | null) => {
    const d = index === null ? undefined : directions[index]
    return d ? { type: directionInstructionType(d.kind), text: d.text, distance: d.distance, stepIndex: d.start } : null
  }
  const instruction = asView(visibleDirection)
  const displayedInstruction = isPoiDestination && !arrived && instruction?.type === 'arrive'
    ? { ...instruction, text: `Continue to ${destinationLabel}` }
    : instruction
  const isManualPreview = previewedStep !== null && previewedStep !== actualStep
  const remainingDistance = routeProgress?.remainingDistance ?? route.totalDistance
  const etaMinutes = estimatePresentationEtaMinutes(remainingDistance)
  const navigationStatus = resolveNavigationStatus({ arrived, isOffRoute })

  const movePreview = useCallback((delta: number) => {
    if (directionCount <= 0) return
    const base = directionAt(route, previewedStep ?? actualStep ?? 0)
    const target = Math.min(Math.max(base + delta, 0), directionCount - 1)
    setPreviewedStep(directions[target].start)
  }, [actualStep, directionCount, directions, previewedStep, route])
  // Step mode: move the route position to the next / previous direction's start (one route point per call).
  const stepForward = useCallback(() => {
    if (actualStep === null || actualDirection === null) return
    const target = directions[actualDirection + 1]?.start
    if (target === undefined) return
    for (let i = actualStep; i < target; i++) nextStep()
  }, [actualDirection, actualStep, directions, nextStep])
  const stepBack = useCallback(() => {
    if (actualStep === null || actualDirection === null) return
    const own = directions[actualDirection].start
    const target = actualStep > own ? own : directions[Math.max(actualDirection - 1, 0)].start
    for (let i = actualStep; i > target; i--) previousStep()
  }, [actualDirection, actualStep, directions, previousStep])

  const voiceGuidanceEnabled = preferences.navigation.voiceGuidance

  return (
    <div className="mt-2 space-y-2" data-testid="active-guidance">
      {/* One status line instead of two boxes and a hint row (2026-11-18: keep the map visible). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--navi-text-secondary)]" aria-label="Active route status">
        <span className="font-semibold text-[var(--navi-text)]">{formatNavigationDistance(remainingDistance)}{routeProgress ? ' remaining' : ''}</span>
        <span aria-hidden="true">·</span>
        <span>{etaMinutes === null ? '—' : `${etaMinutes} min`}</span>
        <span aria-hidden="true">·</span>
        {actualStep === null ? (
          <span>Waiting for current location</span>
        ) : (
          <span>Step {(actualDirection ?? 0) + 1} of {directionCount}</span>
        )}
        {geoError ? (<><span aria-hidden="true">·</span><span role="alert">Location off: tap Next as you walk</span></>) : null}
        <span className="sr-only">{navigationSegmentLabel(navigationSegment)}</span>
        <span className="sr-only" data-testid="progress-mode-label">{progressLabel}</span>
      </div>

      {gpsLostNotice ? <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800" role="status">GPS signal lost: tap Next at each step</p> : null}

      {navigationStatus === 'off-route' && !offRouteDismissed ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--navi-error)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--navi-error)_10%,transparent)] p-3 text-sm text-[var(--navi-error)]" role="alert">
          <p className="font-semibold">You seem off the route</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onRecalculate(location)} className="min-h-11 rounded-lg bg-[var(--navi-error)] px-3 font-semibold text-white">Recalculate</button>
            <button type="button" onClick={() => setOffRouteDismissed(true)} className="min-h-11 rounded-lg border border-[var(--navi-error)] px-3 font-semibold">I&apos;m fine</button>
          </div>
        </div>
      ) : null}


      {navigationStatus === 'arrived' ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-[var(--navi-text)]">You&apos;ve arrived at {destinationLabel}</p>
          <p className="mt-1 text-sm text-[var(--navi-text-secondary)]">
            {[destinationLabel, targetBuildingName, destinationFloorLabel].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-sm text-[var(--navi-text-secondary)]">The route session is complete.</p>
        </div>
      ) : (
        <div aria-label="Current route instruction" aria-live="polite">
          {/* Compact (owner 2026-11-18: the panel covered the map): the instruction, then one row of controls. */}
          <p className="sr-only">Next instruction</p>
          <p className="text-lg font-semibold leading-snug text-[var(--navi-text)]">
            {displayedInstruction?.text ?? 'No instruction is available for this route step.'}
          </p>
          {isManualPreview && visibleStep !== null ? (
            <p className="mt-1 text-xs font-medium text-[var(--navi-primary)]">Viewing step {(visibleDirection ?? 0) + 1} of {directionCount}</p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2" role="group" aria-label="Navigation controls">
        {navigationStatus !== 'arrived' ? (progressMode === 'step' ? <button
          type="button"
          onClick={stepBack}
          disabled={visibleStep === null || visibleStep <= 0}
          className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-medium text-[var(--navi-text)] disabled:opacity-40"
          aria-label="Back one step"
        ><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button> : <button
          type="button"
          onClick={() => movePreview(-1)}
          disabled={visibleStep === null || visibleStep <= 0}
          className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-medium text-[var(--navi-text)] disabled:opacity-40"
          aria-label="Previous instruction"
        ><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>) : null}
        {navigationStatus !== 'arrived' ? (progressMode === 'step' ? <button
          type="button"
          onClick={stepForward}
          disabled={visibleDirection === null || visibleDirection >= directionCount - 1}
          className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--navi-primary)] px-4 text-sm font-semibold text-white disabled:opacity-40"
          aria-label="Next step"
        >Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button> : <button
          type="button"
          onClick={() => movePreview(1)}
          disabled={visibleDirection === null || visibleDirection >= directionCount - 1}
          className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--navi-primary)] px-4 text-sm font-semibold text-white disabled:opacity-40"
          aria-label="Next instruction"
        >Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>) : <span className="flex-1" />}
        {isManualPreview && actualStep !== null ? (
          <button
            type="button"
            onClick={() => setPreviewedStep(null)}
            className="h-11 rounded-xl border border-[var(--navi-primary)] px-3 text-sm font-semibold text-[var(--navi-primary)]"
            aria-label="Return to current step"
          >
            Now
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setNavigationPreferences({ voiceGuidance: !voiceGuidanceEnabled })}
          className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-medium text-[var(--navi-text)] disabled:opacity-40"
          aria-label={voiceGuidanceEnabled ? 'Mute voice guidance' : 'Unmute voice guidance'}
          aria-pressed={voiceGuidanceEnabled}
        >
          {voiceGuidanceEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="h-11 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-medium text-[var(--navi-text)]"
          aria-label="End navigation"
        >
          End
        </button>
      </div>

    </div>
  )
}

/** Bridges the active route context to the existing public indoor state. */
function NavigationIndoorBridge() {
  useNavigationIndoorController()
  return null
}

function NavigationQrScanSheet({
  open,
  onClose,
  onResolved,
  onAnchored,
}: {
  open: boolean
  onClose: () => void
  onResolved: (location: QrLocation, mode: 'start' | 'destination') => void
  onAnchored: (location: QrLocation) => void
}) {
  const context = useNavigationContext()
  return <QRScanSheet open={open} onClose={onClose} onResolved={(location, mode) => {
    if (mode === 'start' && context.sessionActive && location.nodeId && context.anchorAtNode(location.nodeId)) {
      onAnchored(location)
      onClose()
      return
    }
    onResolved(location, mode)
  }} />
}

export default function NavigatePage() {
  return (
    <Suspense fallback={
      <div className="flex h-full flex-col gap-4 p-4" aria-label="Loading navigation" role="status">
        <div className="h-12 w-full animate-pulse rounded-2xl bg-[color:color-mix(in_srgb,var(--navi-border)_60%,transparent)]" />
        <div className="flex-1 animate-pulse rounded-2xl bg-[color:color-mix(in_srgb,var(--navi-border)_40%,transparent)]" />
      </div>
    }>
      <NavigatePageContent />
    </Suspense>
  )
}

function NavigatePageContent() {
  const qrDeepLink = useQrNavigateDeepLink()
  const campus = usePublicStore((s) => s.campus)
  const campusLoading = usePublicStore((s) => s.campusLoading)
  const campusError = usePublicStore((s) => s.campusError)
  const fetchCampusData = usePublicStore((s) => s.fetchCampusData)
  const storedFrom = usePublicStore((s) => s.fromNode)
  const toNode = usePublicStore((s) => s.toNode)
  const poiDestination = usePublicStore((s) => s.poiDestination)
  const setFrom = usePublicStore((s) => s.setFrom)
  const qrLocation = usePublicStore((s) => s.qrLocation)
  const setQrLocation = usePublicStore((s) => s.setQrLocation)
  const setTo = usePublicStore((s) => s.setTo)
  const setPoiDestination = usePublicStore((s) => s.setPoiDestination)
  const activeFloor = usePublicStore((s) => s.activeFloor)
  const preferences = usePublicStore((s) => s.preferences)
  const setNavigationPreferences = usePublicStore((s) => s.setNavigationPreferences)
  const setActiveFloor = usePublicStore((s) => s.setActiveFloor)
  const recentDestinations = usePublicStore((s) => s.recentDestinations)
  const addRecentDestination = usePublicStore((s) => s.addRecentDestination)
  const searchPublishedEntries = usePublicStore((s) => s.findEntries)
  const revealSearchPois = usePublicStore((s) => s.search)
  const findDestinationRoute = usePublicStore((s) => s.findDestinationRoute)

  const [picker, setPicker] = useState<PickerRole | null>(null)
  const [query, setQuery] = useState('')
  const [expandedRouteKey, setExpandedRouteKey] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationSuggestion, setLocationSuggestion] = useState<{ nodeId: string; label: string; accuracyM: number } | null>(null)
  const [startedRouteKey, setStartedRouteKey] = useState<string | null>(null)
  const restartAfterRerouteRef = useRef(false)
  const [activeCameraMode, setActiveCameraMode] = useState<NavigationCameraMode>('TOP')
  const [activeHeadingFollow, setActiveHeadingFollow] = useState(() => preferences.navigation.headingFollow)
  const [activeTopOrientation, setActiveTopOrientation] = useState<TopCameraOrientation>(
    () => preferences.navigation.headingFollow ? 'heading-follow' : 'free',
  )
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    if (!campus && !campusLoading && !campusError) void fetchCampusData()
  }, [campus, campusLoading, campusError, fetchCampusData])

  // Stable destination links prefill setup after hydration without changing the
  // initial server render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('qr')) return
    const to = params.get('to')?.trim()
    const from = params.get('from')?.trim()
    if (to) {
      setTo(to)
      addRecentDestination(to)
    }
    if (from) setFrom(from)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No start set (and no QR location): the route starts at the campus entrance gate; the visitor can change it.
  const gateStart = useMemo(() => (campus ? defaultStart({ nodes: campus.nodes, poi: campus.poi }) : null), [campus])
  const startsAtGate = !storedFrom && !qrLocation && Boolean(gateStart)
  const fromNode = storedFrom ?? (startsAtGate ? gateStart!.nodeId : null)
  const nodes = useMemo(() => campus?.nodes ?? [], [campus])
  const routeEdges = useMemo(() => campus?.edges ?? [], [campus])
  const buildings = campus?.buildings ?? []
  const routeCandidate = useMemo<NavRoute | null>(() => {
    if (!campus || !fromNode || (!toNode && !poiDestination)) return null
    return findDestinationRoute(fromNode)
  }, [campus, findDestinationRoute, fromNode, poiDestination, toNode])

  const route = useMemo<NavRoute | null>(() => (
    validateNavigationRoute(routeCandidate).valid ? routeCandidate : null
  ), [routeCandidate])

  const routeKey = getNavigationRouteKey(route)
  const routeStepsExpanded = expandedRouteKey !== null && expandedRouteKey === routeKey
  const activePoiDestination = useMemo(
    () => poiDestination && campus
      ? findPublicPoi(campus.poi, poiDestination.poiId)
      : null,
    [campus, poiDestination],
  )
  const isPoiRoute = route?.destination?.entityType === 'poi'
  const canStartNavigation = Boolean(
    routeKey
      && (!isPoiRoute || activePoiDestination?.id === route?.destination?.entityId),
  )
  const cameraBounds = useMemo(() => routeCameraBounds(route), [route])
  // Route availability is preview-only. An active phase is possible only for
  // the exact route key explicitly started by the user.
  const experiencePhase = routeKey === null
    ? 'setup'
    : startedRouteKey === routeKey
      ? 'active'
      : 'route-preview'

  useEffect(() => {
    if (!restartAfterRerouteRef.current || !routeKey || routeKey === startedRouteKey) return
    restartAfterRerouteRef.current = false
    setStartedRouteKey(routeKey)
  }, [routeKey, startedRouteKey])

  const recalculateFromLocation = useCallback((location: LatLng | null) => {
    if (!location) { showToast('Current location unavailable'); return }
    const nearest = resolveNearestNode(nodes, location, undefined, routeEdges)
    if (!nearest) { showToast('No nearby route starting point is available'); return }
    restartAfterRerouteRef.current = true
    setFrom(nearest.node.id)
  }, [nodes, routeEdges, setFrom, showToast])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const visibleQrLocation = qrLocation
    ?? (qrDeepLink.status === 'resolved' || qrDeepLink.status === 'non-routable' ? qrDeepLink.location : null)
  // Real names, never route point ids like "N-112" (2026-11-18): the point's own name, else what search calls it,
  // else its building.
  const buildingNameOf = useCallback((id: string) => buildings.find((building) => building.id === id)?.name, [buildings])
  const fromLabel = startsAtGate
    ? gateStart!.label
    : fromNode
    ? readablePlaceLabel({ nodeLabel: nodeById.get(fromNode)?.label, nodeId: fromNode, entryLabel: entryForNode(campus, fromNode)?.label, buildingName: buildingNameOf(nodeById.get(fromNode)?.buildingId ?? ''), fallback: 'Selected start' })
    : visibleQrLocation?.label ?? 'My Location'
  const toEntry = entryForNode(campus, toNode)
  const poiEntry = entryForPoi(campus, poiDestination?.poiId ?? null)
  const toLabel = poiDestination
    ? activePoiDestination?.label ?? poiEntry?.label ?? 'Campus place'
    : toNode
      ? readablePlaceLabel({ nodeLabel: nodeById.get(toNode)?.label, nodeId: toNode, entryLabel: toEntry?.label, buildingName: buildingNameOf(nodeById.get(toNode)?.buildingId ?? '') })
    : null
  const composition = useMemo(
    () => getNavigationRouteComposition(route),
    [route],
  )
  const targetBuilding = composition.targetBuildingId
    ? buildings.find((building) => building.id === composition.targetBuildingId)
    : undefined

  const searchResults = useMemo(() => {
    if (!campus || !picker) return []
    if (!query.trim()) return []
    return searchPublishedEntries(query)
      .filter((entry) => picker === 'from'
        ? Boolean(entry.nodeId)
        : Boolean(entry.nodeId)
          || (entry.type === 'poi' && entry.source === 'authored' && Boolean(entry.sourceId ?? entry.id)))
      .slice(0, 12)
  }, [campus, picker, query, searchPublishedEntries])
  // Hidden-but-searchable POIs show on the map while they are being searched; done after rendering, not during it.
  useEffect(() => {
    if (campus && picker) revealSearchPois(query)
  }, [campus, picker, query, revealSearchPois])

  const recentEntries = useMemo(() => {
    if (!campus) return []
    const seen = new Set<string>()
    return recentDestinations
      .map((id) => entryForNode(campus, id))
      .filter((entry): entry is SearchEntry & { nodeId: string } => {
        if (!entry?.nodeId || seen.has(entry.nodeId)) return false
        seen.add(entry.nodeId)
        return true
      })
      .slice(0, 4)
  }, [campus, recentDestinations])

  const closePicker = () => {
    setPicker(null)
    setQuery('')
  }

  const chooseEntry = (entry: SearchEntry) => {
    if (picker === 'from') {
      if (!entry.nodeId) {
        showToast('This location is unavailable as an origin')
        return
      }
      setFrom(entry.nodeId)
    } else if (entry.nodeId) {
      setTo(entry.nodeId)
      addRecentDestination(entry.nodeId)
    } else if (entry.type === 'poi' && entry.source === 'authored') {
      setPoiDestination(entry.sourceId ?? entry.id)
    } else {
      showToast('This destination is unavailable')
      return
    }
    closePicker()
  }

  const handleLocate = () => {
    if (locating) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast('Location unavailable')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const accuracyM = position.coords.accuracy
        if (!Number.isFinite(accuracyM) || accuracyM > GPS_GOOD_ACCURACY_M) {
          setLocationSuggestion(null)
          showToast(Number.isFinite(accuracyM)
            ? `Location too rough (±${Math.round(accuracyM)} m): scan a QR or search where you are`
            : 'Location accuracy unavailable: scan a QR or search where you are')
          return
        }
        // Only a point the route network reaches can start a route.
        const resolved = resolveNearestNode(nodes, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }, undefined, routeEdges)
        if (!resolved) {
          showToast('Location unavailable — choose a supported origin')
          return
        }
        setLocationSuggestion({ nodeId: resolved.node.id, label: resolved.node.label, accuracyM })
      },
      () => {
        setLocating(false)
        showToast('Location unavailable')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
  }

  const handleScanResolved = useCallback(
    (location: QrLocation, mode: 'start' | 'destination') => {
      if (mode === 'start') {
        if (!location.nodeId) {
          showToast('QR location found, but no routing anchor is published')
          return
        }
        setQrLocation(location)
      } else if (!location.nodeId) {
        showToast('This QR location cannot be used as a destination')
        return
      } else {
        setTo(location.nodeId)
        addRecentDestination(location.nodeId)
      }
      showToast(`${mode === 'start' ? 'Current location' : 'Destination'} set: ${location.label}`)
    },
    [addRecentDestination, setQrLocation, setTo, showToast],
  )

  const swapRoute = () => {
    if (poiDestination) return
    const currentFrom = fromNode
    setFrom(toNode)
    setTo(currentFrom)
  }

  const clearRoute = () => {
    const headingFollow = usePublicStore.getState().preferences.navigation.headingFollow
    setFrom(null)
    setTo(null)
    setPoiDestination(null)
    setActiveFloor(0)
    setStartedRouteKey(null)
    setExpandedRouteKey(null)
    setActiveCameraMode('TOP')
    setActiveTopOrientation(headingFollow ? 'heading-follow' : 'free')
    setActiveHeadingFollow(headingFollow)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', stripNavigateSessionParameters(window.location.href))
    }
  }

  const startNavigation = () => {
    if (!routeKey) return
    if (isPoiRoute && (!activePoiDestination || activePoiDestination.id !== route?.destination?.entityId)) {
      showToast('Destination data is unavailable')
      return
    }
    const navigationPreferences = usePublicStore.getState().preferences.navigation
    setActiveCameraMode(cameraModeForPreference(navigationPreferences.defaultMapView))
    setActiveHeadingFollow(navigationPreferences.headingFollow)
    setActiveTopOrientation(navigationPreferences.headingFollow ? 'heading-follow' : 'free')
    setExpandedRouteKey(null)
    setStartedRouteKey(routeKey)
  }

  if (campusError && !campus) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="text-sm text-[var(--navi-text-secondary)]">Couldn&apos;t load campus data.</div>
        <div className="text-xs text-[var(--navi-error)]">{campusError}</div>
        <button
          type="button"
          onClick={() => void fetchCampusData()}
          className="min-h-11 rounded-xl bg-[var(--navi-primary)] px-4 text-sm font-semibold text-white"
          aria-label="Retry loading campus data"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!campus || campusLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4" aria-label="Loading navigation" role="status">
        <div className="h-28 animate-pulse rounded-2xl bg-[color:color-mix(in_srgb,var(--navi-border)_60%,transparent)]" />
        <div className="flex-1 animate-pulse rounded-2xl bg-[color:color-mix(in_srgb,var(--navi-border)_40%,transparent)]" />
      </div>
    )
  }

  const hasDestination = Boolean(toNode || poiDestination)
  const routeUnavailable = Boolean(fromNode && hasDestination && (!routeCandidate || !route))
  const previewEta = route ? estimatePresentationEtaMinutes(route.totalDistance) : null
  const entranceFloor = routeFloorLabel(composition.entranceFloor)
  const destinationFloor = routeFloorLabel(composition.destinationFloor)

  const pickerSurface = picker ? (
    <div
      className="absolute inset-x-0 top-0 z-30 border-b border-[var(--navi-border)] bg-[var(--navi-card)] p-4 shadow-xl"
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--navi-border)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--navi-text)] outline-none"
            placeholder={picker === 'from' ? 'Search where you are (room, building, place)' : 'Search building, room, or place'}
            aria-label={picker === 'from' ? 'Search origin' : 'Search destination'}
          />
          <button
            type="button"
            onClick={closePicker}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--navi-text-secondary)] hover:bg-[var(--navi-content)]"
            aria-label="Close location search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {picker === 'from' ? (
          <button
            type="button"
            onClick={() => {
              closePicker()
              handleLocate()
            }}
            disabled={locating}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-medium text-[var(--navi-text)] disabled:opacity-50"
            aria-label="Use my current location"
          >
            <Crosshair className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {locating ? 'Locating…' : 'Use my current location'}
          </button>
        ) : null}
        <div className="mt-3 max-h-[min(50vh,24rem)] overflow-y-auto" role="list" aria-label="Location search results">
          {query.trim() && searchResults.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-[var(--navi-text-secondary)]">
              No matching published places.
            </p>
          ) : null}
          {searchResults.map((entry) => (
            <button
              type="button"
              key={`${entry.type}:${entry.id}`}
              onClick={() => chooseEntry(entry)}
              className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--navi-content)]"
              aria-label={`Choose ${entry.label}`}
            >
              <MapPin className="h-4 w-4 shrink-0 text-[var(--navi-primary)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--navi-text)]">{entry.label}</span>
              <span className="shrink-0 text-[11px] text-[var(--navi-text-secondary)]">
                {entry.type}{entry.floor !== undefined ? ` · ${routeFloorLabel(entry.floor)}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null

  const idleSurface = experiencePhase === 'setup' ? (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-4"
      data-testid="navigate-idle-surface"
    >
      <div className="mx-auto w-full max-w-xl space-y-1.5">
        <section className="pointer-events-auto rounded-2xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_95%,transparent)] p-2.5 shadow-xl backdrop-blur" aria-label="Destination search">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPicker('to')}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[var(--navi-border)] bg-[var(--navi-content)] px-3 text-left hover:border-[var(--navi-primary)]"
              aria-label="Search building, room, or place"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[var(--navi-primary)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--navi-text)]">{toLabel ?? 'Search building, room, or place'}</span>
              <Search className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setPicker('from')}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-[var(--navi-border)] px-3 text-left text-sm font-medium text-[var(--navi-text)] hover:border-[var(--navi-primary)]"
              aria-label={fromNode || visibleQrLocation ? `From ${fromLabel}` : 'Set starting point'}
            >
              <Locate className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="min-w-0 truncate">{fromNode || visibleQrLocation ? fromLabel : 'Set starting point'}</span>
            </button>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--navi-border)] px-3 text-xs font-medium text-[var(--navi-text-secondary)]"
              aria-label="Scan a NAVI code"
              title="Scan a NAVI code"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {recentEntries.length > 0 && !hasDestination ? (
          <section className="pointer-events-auto rounded-2xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_95%,transparent)] p-2.5 shadow-lg backdrop-blur" aria-labelledby="recent-destinations-title">
            <h2 id="recent-destinations-title" className="text-[10px] font-semibold uppercase tracking-wide text-[var(--navi-text-secondary)]">Recent destinations</h2>
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {recentEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.nodeId}
                  onClick={() => {
                    setTo(entry.nodeId)
                    addRecentDestination(entry.nodeId)
                  }}
                  className="flex min-h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--navi-border)] px-2.5 text-left text-xs text-[var(--navi-text)] hover:border-[var(--navi-primary)]"
                  aria-label={`Choose recent destination ${entry.label}`}
                >
                  <Navigation className="h-3.5 w-3.5 shrink-0 text-[var(--navi-primary)]" aria-hidden="true" />
                  <span className="max-w-36 truncate">{entry.label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {qrDeepLink.status === 'loading' ? (
          <p className="pointer-events-auto rounded-xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_95%,transparent)] p-3 text-sm text-[var(--navi-text-secondary)] shadow-lg backdrop-blur" role="status" aria-live="polite">
            Resolving QR location…
          </p>
        ) : null}
        {qrDeepLink.status === 'error' ? (
          <div className="pointer-events-auto rounded-xl border border-[color:color-mix(in_srgb,var(--navi-error)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--navi-error)_10%,transparent)] p-3 text-sm text-[var(--navi-error)] shadow-lg backdrop-blur" role="alert">
            <p>{qrDeepLink.message}</p>
            <button
              type="button"
              onClick={qrDeepLink.retry}
              className="mt-2 min-h-10 rounded-xl border border-[color:color-mix(in_srgb,var(--navi-error)_40%,transparent)] px-3 font-semibold"
            >
              Try QR again
            </button>
          </div>
        ) : null}
        {qrDeepLink.status === 'non-routable' ? (
          <p className="pointer-events-auto rounded-xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_95%,transparent)] p-3 text-sm text-[var(--navi-text-secondary)] shadow-lg backdrop-blur" role="status">
            QR location found: {visibleQrLocation?.label ?? 'checkpoint'}, but no routing anchor is published. Choose a supported origin to build a route.
          </p>
        ) : null}
        {routeUnavailable ? (
          <div className="pointer-events-auto rounded-xl border border-l-4 border-[var(--navi-border)] border-l-[var(--navi-error)] bg-[var(--navi-card)] p-3 text-sm shadow-lg" role="alert">
            <p className="font-semibold text-[var(--navi-error)]">No route is currently available to this destination.</p>
            <p className="mt-1 text-xs text-[var(--navi-text-secondary)]">It may not be connected yet. Try its building, or start from another place.</p>
          </div>
        ) : null}
        {!fromNode && hasDestination ? (
          <div className="pointer-events-auto rounded-xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_95%,transparent)] p-3 text-sm text-[var(--navi-text-secondary)] shadow-lg backdrop-blur" role="status">
            Set your current location to preview a route.
          </div>
        ) : null}
      </div>
    </div>
  ) : null

  const mapSurface = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-navigation-phase={experiencePhase}>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="navigation-map-viewport">
        <NavigationRouteMap
          bundle={campus}
          route={route}
          active={experiencePhase === 'active'}
          navigationTargetBuildingId={composition.targetBuildingId ?? undefined}
          // The destination building opens in 2.5D on its floor (owner 2026-11-18), when the route ends inside it.
          navigationTargetFloor={composition.destination?.buildingId && composition.destination.buildingId === composition.targetBuildingId && composition.destinationFloor !== null ? composition.destinationFloor : undefined}
          camera={{
            surface: experiencePhase === 'route-preview' ? 'route-preview' : 'active',
            mode: experiencePhase === 'route-preview' ? 'TOP' : activeCameraMode,
            initialSetup: experiencePhase === 'setup',
            topOrientation: experiencePhase === 'route-preview' ? 'free' : activeTopOrientation,
            headingFollowEnabled: activeHeadingFollow,
            onModeChange: (mode) => {
              setActiveCameraMode(mode)
              if (mode === 'POV') {
                setActiveHeadingFollow(true)
                setActiveTopOrientation('heading-follow')
                setNavigationPreferences({ headingFollow: true })
              }
            },
            onToggleHeadingFollow: (enabled: boolean) => {
              setActiveHeadingFollow(enabled)
              setActiveTopOrientation(enabled ? 'heading-follow' : 'free')
              setNavigationPreferences({ headingFollow: enabled })
            },
            routeBounds: cameraBounds,
            reducedMotion: preferences.accessibility.reducedMotion,
            showControls: true,
          }}
        />
        {idleSurface}
        {locationSuggestion && experiencePhase === 'setup' ? <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-40 mx-auto max-w-md"><LocationSuggestion
          label={locationSuggestion.label}
          accuracyM={locationSuggestion.accuracyM}
          onConfirm={() => { setFrom(locationSuggestion.nodeId); showToast(`Current location set: ${locationSuggestion.label}`); setLocationSuggestion(null) }}
          onReject={() => setLocationSuggestion(null)}
        /></div> : null}
        {experiencePhase === 'route-preview' && route ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
            <button
              type="button"
              onClick={() => setPicker('to')}
              className="pointer-events-auto mx-auto flex min-h-12 w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--navi-border)] bg-[var(--navi-card)] px-4 text-left text-sm font-semibold text-[var(--navi-text)] shadow-md"
              aria-label={`Change destination, ${toLabel ?? route.toLabel}`}
            >
              <MapPin className="h-4 w-4 shrink-0 text-[var(--navi-primary)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">{toLabel ?? route.toLabel}</span>
              <Search className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {experiencePhase === 'active' && route ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-2 sm:p-4">
          <section
            className="pointer-events-auto mx-auto max-h-[60dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--navi-border)] bg-[color:color-mix(in_srgb,var(--navi-card)_97%,transparent)] p-3 shadow-xl backdrop-blur"
            aria-labelledby="route-surface-title"
          >
          {/* One line (owner 2026-11-18: the panel covered the map): where you are going, and close. */}
          <div className="flex items-center justify-between gap-2">
            <p className="sr-only">Active navigation</p>
            <h1 id="route-surface-title" className="min-w-0 truncate text-xs font-semibold text-[var(--navi-text-secondary)]">
              To <span className="text-[var(--navi-text)]">{toLabel}</span>
              {targetBuilding && targetBuilding.name.trim().toLowerCase() !== (toLabel ?? '').trim().toLowerCase() ? ` · ${targetBuilding.name}` : ''}
            </h1>
            <button
              type="button"
              onClick={clearRoute}
              className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--navi-text-secondary)] hover:bg-[var(--navi-content)]"
              aria-label="Clear route"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <ActiveNavigationGuidance
            route={route}
            destinationLabel={toLabel ?? route.toLabel}
            isPoiDestination={isPoiRoute}
            targetBuildingName={targetBuilding?.name}
            buildingName={buildingNameOf}
            destinationFloorLabel={destinationFloor}
            onEnd={clearRoute}
            onRecalculate={recalculateFromLocation}
          />
          </section>
        </div>
      ) : null}
      {pickerSurface}
      {toast ? <div className="absolute bottom-6 left-4 right-4 z-30 mx-auto max-w-md rounded-xl bg-[var(--navi-text)] px-4 py-3 text-center text-sm text-[var(--navi-card)] shadow-lg" role="status">{toast}</div> : null}
      </div>
      {experiencePhase === 'route-preview' && route ? (
        <section
          className="relative z-20 flex max-h-[min(48dvh,28rem)] shrink-0 flex-col overflow-hidden border-t border-[var(--navi-border)] bg-[var(--navi-card)] shadow-[0_-4px_16px_rgba(23,43,35,0.08)]"
          data-testid="route-preview-dock"
          aria-labelledby="route-surface-title"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--navi-primary)]">Route preview</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpandedRouteKey(routeStepsExpanded ? null : routeKey)}
                className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-[var(--navi-primary)] hover:bg-[var(--navi-primary-light)]"
                aria-expanded={routeStepsExpanded}
                aria-controls="route-preview-steps"
              >
                {routeStepsExpanded ? 'Fewer details' : 'All steps'}
                {routeStepsExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={clearRoute}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--navi-text-secondary)] hover:bg-[var(--navi-content)]"
                aria-label="Clear route"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="shrink-0 px-4 pb-2">
            <h1 id="route-surface-title" className="text-lg font-semibold leading-tight text-[var(--navi-text)]">{toLabel ?? route.toLabel}</h1>
            <p className="mt-0.5 text-xs text-[var(--navi-text-secondary)]">From {fromLabel}{destinationFloor ? ` · ${destinationFloor}` : ''}</p>
            <div className="mt-2 flex items-center gap-2" aria-label="Route summary">
              <strong className="text-xl leading-none text-[var(--navi-text)]">{previewEta === null ? '—' : `${previewEta} min`}</strong>
              <span className="text-xs text-[var(--navi-text-secondary)]">{formatNavigationDistance(route.totalDistance)}</span>
              <span className="ml-auto rounded-full border border-[var(--navi-border)] bg-[var(--navi-content)] px-3 py-1 text-xs font-medium text-[var(--navi-text)]">Walking</span>
            </div>
            {composition.selectedEntrance ? (
              <p className="mt-1 text-xs text-[var(--navi-text-secondary)]">Enter via {composition.selectedEntrance.label}{entranceFloor ? ` · ${entranceFloor}` : ''}</p>
            ) : null}
          </div>
          {routeStepsExpanded ? (
            <ol
              id="route-preview-steps"
              className="min-h-0 flex-1 divide-y divide-[var(--navi-border)] overflow-y-auto border-t border-[var(--navi-border)] px-4"
              role="list"
              aria-label="Route steps"
            >
              {describeDirections(route, { building: buildingNameOf, destination: toLabel ?? undefined }).map((direction, index) => (
                <li key={`${direction.start}:${index}`} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--navi-primary-light)] text-xs font-semibold text-[var(--navi-primary)]">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-[var(--navi-text)]">{direction.text}</span>
                  <span className="shrink-0 text-xs text-[var(--navi-text-secondary)]">{direction.distance > 0 ? formatNavigationDistance(direction.distance) : ''}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--navi-border)] px-4 py-2">
            {canStartNavigation ? (
              <button
                type="button"
                onClick={startNavigation}
                className="min-h-12 flex-1 rounded-xl bg-[var(--navi-primary)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--navi-primary-dark)]"
                aria-label="Start navigation"
              >
                Start navigation
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPicker('to')}
              className="min-h-12 rounded-xl border border-[var(--navi-border)] px-3 text-sm font-semibold text-[var(--navi-text)]"
              aria-label="Change destination"
            >
              Change
            </button>
            {!isPoiRoute ? (
              <button
                type="button"
                onClick={swapRoute}
                className="flex min-h-12 items-center justify-center rounded-xl border border-[var(--navi-border)] px-3 text-sm font-semibold text-[var(--navi-text)]"
                aria-label="Swap start and destination"
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )

  return (
    <NavigationSession
      route={route}
      active={experiencePhase === 'active'}
      activeFloor={activeFloor}
      setActiveFloor={setActiveFloor}
      poiDestination={activePoiDestination}
      onArrival={() => showToast('You have arrived at your destination.')}
    >
      <NavigationIndoorBridge />
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {mapSurface}
        <NavigationQrScanSheet
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onResolved={handleScanResolved}
          onAnchored={(location) => { setQrLocation(location); showToast(`Progress anchored at ${location.label}`) }}
        />
      </div>
    </NavigationSession>
  )
}
