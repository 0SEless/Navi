'use client'

import { useEffect, useRef, useMemo, useState, useSyncExternalStore, useCallback, type ReactNode } from 'react'
import { NavigationProvider } from './NavigationContext'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useNavigationHeading } from '@/hooks/useNavigationHeading'
import { computeRouteProgress, progressAtStep } from '@/lib/nav-route-helpers'
import { getNavigationRouteKey, resolveNavigationStatus } from '@/lib/navigation-experience'
import { haversine } from '@/engine/geo-utils'
import { isPoiArrival, type PoiArrivalContext } from '@navi/runtime/routing'
import type { POI } from '@navi/core'
import type { NavRoute } from '@/types/route-types'
import type { LatLng } from '@/types/nav-types'
import { isNavigationDevSimulationEnabled } from '@/lib/navigation-dev-simulation'
import { GPS_DROP_GRACE_MS, isGoodFix, nextProgressMode, progressModeLabel, shouldWarnOffRoute, type ProgressMode } from '@/lib/navigation-progress-source'

/** Arrival threshold — positional distance to destination node (meters). */
const ARRIVAL_THRESHOLD_M = 15
/** Deviation threshold — perpendicular distance from route polyline (meters). */
export interface NavigationSessionLocationOverride {
  position: LatLng
  heading?: number | null
  speed?: number | null
  timestamp?: number | null
  accuracy?: number | null
}

export type NavigationSessionLocationContext = PoiArrivalContext

interface NavigationArrivalLatch {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => string | null
  reset: () => void
  mark: (routeKey: string) => void
}

function createNavigationArrivalLatch(): NavigationArrivalLatch {
  let snapshot: string | null = null
  const listeners = new Set<() => void>()

  const emit = (next: string | null) => {
    if (snapshot === next) return
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    reset: () => emit(null),
    mark: (routeKey) => emit(routeKey),
  }
}

interface NavigationSessionProps {
  /** Enriched route from findRoute. When null, session is inactive. */
  route: NavRoute | null
  /** True only after the user crosses the explicit Start Navigation boundary. */
  active?: boolean
  /** Current floor from the store (setActiveFloor). */
  activeFloor: number
  /** Setter to update the store's activeFloor. */
  setActiveFloor: (floor: number) => void
  /** Called when user arrives at destination. */
  onArrival?: () => void
  /** Transient runtime POI projection used only for geometry-aware arrival. */
  poiDestination?: POI | null
  /** Optional authoritative indoor/outdoor localization context for arrival. */
  locationContext?: NavigationSessionLocationContext
  /** Explicit development-only input seam; ignored in production builds. */
  locationOverride?: NavigationSessionLocationOverride
  /** Children to wrap with NavigationProvider. */
  children: ReactNode
}

/**
 * NavigationSession — the canonical NavigationContext owner for the Navigate surface.
 *
 * Responsibilities:
 * - Continuous GPS via useGeolocation({ watch: true })
 * - Route-polyline progress (computeRouteProgress) → currentNodeId
 * - Auto floor/building switch based on current step (replaces activeStepIdx-driven floor)
 * - Manual override that expires on significant progress
 * - Arrival detection (distance < 15m OR currentNode = destination)
 * - Deviation detection (> 30m from route) exposed as read-only context
 * - Feeds NavigationProvider with real data
 */
export function NavigationSession({
  route,
  active = false,
  activeFloor,
  setActiveFloor,
  onArrival,
  poiDestination = null,
  locationContext,
  locationOverride,
  children,
}: NavigationSessionProps) {
  const devLocationOverride = isNavigationDevSimulationEnabled() ? locationOverride ?? null : null
  const {
    latitude,
    longitude,
    heading: gpsHeading,
    speed,
    timestamp,
    accuracy,
    error: geoError,
  } = useGeolocation({ watch: true })

  const position: LatLng | null = useMemo(
    () => devLocationOverride?.position
      ?? (latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null),
    [devLocationOverride?.position, latitude, longitude],
  )

  const headingInput = devLocationOverride ? devLocationOverride.heading ?? null : gpsHeading
  const speedInput = devLocationOverride ? devLocationOverride.speed ?? null : speed
  const timestampInput = devLocationOverride ? devLocationOverride.timestamp ?? null : timestamp
  const accuracyInput = devLocationOverride ? devLocationOverride.accuracy ?? null : accuracy
  const headingEnabled = true

  // Heading is a presentation signal only. The Capture resolver owns sensor
  // thresholds, freshness, normalization, and device/GPS fallback behavior.
  const {
    direction,
    canRequestPermission,
    enableDirection,
  } = useNavigationHeading({
    position,
    heading: headingInput,
    speed: speedInput,
    timestamp: timestampInput,
    enabled: headingEnabled,
  })

  const routeKey = getNavigationRouteKey(route)
  const [progressMode, setProgressMode] = useState<ProgressMode>('step')
  const progressModeRef = useRef<ProgressMode>('step')
  const lastGoodFixAtRef = useRef<number | null>(null)
  const [manualIndex, setManualIndex] = useState(0)
  const [gpsLostNotice, setGpsLostNotice] = useState(false)
  const progressRef = useRef<ReturnType<typeof computeRouteProgress> | null>(null)
  const currentCandidate = useMemo(
    () => (active && route && position ? computeRouteProgress(route, position) : null),
    [active, route, position],
  )
  progressRef.current = currentCandidate
  const progressRouteKeyRef = useRef(routeKey)
  useEffect(() => {
    if (routeKey === progressRouteKeyRef.current) return
    progressRouteKeyRef.current = routeKey
    setManualIndex(0)
    setProgressMode('step')
    progressModeRef.current = 'step'
    lastGoodFixAtRef.current = null
    setGpsLostNotice(false)
  }, [routeKey])
  const routeResetPending = progressRouteKeyRef.current !== routeKey
  const indoors = Boolean(route?.steps[(progressMode === 'gps' ? currentCandidate?.index : manualIndex) ?? manualIndex]?.buildingId)
  const updateProgressMode = useCallback((now: number) => {
    if (!active) {
      progressModeRef.current = 'step'
      setProgressMode('step')
      return
    }
    const fix = accuracyInput === null ? null : { accuracy: accuracyInput, timestamp: timestampInput ?? now }
    const goodFreshFix = isGoodFix(fix) && fix !== null
      && now - fix.timestamp >= 0
      && now - fix.timestamp <= GPS_DROP_GRACE_MS
    if (goodFreshFix && fix) {
      lastGoodFixAtRef.current = fix.timestamp
    }
    const next = nextProgressMode({ previous: progressModeRef.current, fix, now, lastGoodFixAt: lastGoodFixAtRef.current, indoors })
    if (progressModeRef.current === 'gps' && next === 'step') {
      setManualIndex(progressRef.current?.index ?? manualIndex)
      if (!indoors && !goodFreshFix) setGpsLostNotice(true)
    }
    progressModeRef.current = next
    setProgressMode(next)
  }, [accuracyInput, active, indoors, manualIndex, timestampInput])
  useEffect(() => { updateProgressMode(Date.now()) }, [updateProgressMode, position, geoError])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => updateProgressMode(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, updateProgressMode])
  const progress = useMemo(() => {
    if (!active || !route) return null
    if (routeResetPending) return progressAtStep(route, 0)
    return progressMode === 'gps' ? currentCandidate : progressAtStep(route, manualIndex)
  }, [active, currentCandidate, manualIndex, progressMode, route, routeResetPending])
  const effectiveLocation = progressMode === 'step' && progress ? progress.snappedPosition : position
  const nextStep = useCallback(() => {
    if (!route) return
    setGpsLostNotice(false)
    setManualIndex(index => Math.min(index + 1, route.steps.length - 1))
  }, [route])
  const previousStep = useCallback(() => setManualIndex(index => Math.max(index - 1, 0)), [])
  const anchorAtNode = useCallback((nodeId: string) => {
    const index = route?.steps.findIndex(step => step.nodeId === nodeId) ?? -1
    if (index < 0) return false
    setManualIndex(index)
    setProgressMode('step')
    progressModeRef.current = 'step'
    setGpsLostNotice(false)
    return true
  }, [route])

  // ---- Current node from progress (NOT independent resolveNearestNode) ----
  const currentNodeId = useMemo(() => {
    if (!route || !progress) return null
    const idx = Math.min(progress.index, route.steps.length - 1)
    return route.steps[idx]?.nodeId ?? null
  }, [route, progress])

  const currentNodeFloor = useMemo(() => {
    if (!route || !currentNodeId) return undefined
    return route.steps.find(s => s.nodeId === currentNodeId)?.floor
  }, [route, currentNodeId])

  const currentNodeBuildingId = useMemo(() => {
    if (!route || !currentNodeId) return undefined
    return route.steps.find(s => s.nodeId === currentNodeId)?.buildingId
  }, [route, currentNodeId])

  const [arrivalLatch] = useState(createNavigationArrivalLatch)
  const latchedRouteKey = useSyncExternalStore(
    arrivalLatch.subscribe,
    arrivalLatch.getSnapshot,
    arrivalLatch.getSnapshot,
  )

  const activePoiDestination = useMemo(() => {
    if (route?.destination?.entityType !== 'poi') return null
    if (!poiDestination || poiDestination.id !== route.destination.entityId) return null
    return poiDestination
  }, [poiDestination, route])

  const arrivalNotifiedRef = useRef(false)
  // A new route is a new navigation session. Clear its route-scoped
  // notification guard before any new route can report arrival.
  const previousRouteKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active || routeKey === null) {
      previousRouteKeyRef.current = null
      arrivalNotifiedRef.current = false
      arrivalLatch.reset()
      return
    }
    if (routeKey === previousRouteKeyRef.current) return
    previousRouteKeyRef.current = routeKey
    arrivalNotifiedRef.current = false
    arrivalLatch.reset()
  }, [active, arrivalLatch, routeKey])

  const poiArrivalContext = useMemo<PoiArrivalContext>(() => (
    locationContext ?? {
      buildingId: currentNodeBuildingId,
      floor: activeFloor,
    }
  ), [activeFloor, currentNodeBuildingId, locationContext])

  // ---- Auto floor switch ----
  useEffect(() => {
    if (!active || currentNodeFloor === undefined) return

    setActiveFloor(currentNodeFloor)
  }, [active, currentNodeFloor, setActiveFloor])

  // ---- Arrival detection ----
  const arrivalCondition = useMemo(() => {
    if (!active || !route || !effectiveLocation || routeResetPending) return false

    if (route.destination?.entityType === 'poi') {
      return activePoiDestination
        ? isPoiArrival(effectiveLocation, activePoiDestination, poiArrivalContext)
        : false
    }

    const destNode = route.steps[route.steps.length - 1]
    if (!destNode) return false

    // Dual condition: positional distance < threshold OR currentNode = destination
    const distMeters = haversine(effectiveLocation, destNode.position)
    const atDestination = currentNodeId === route.arrival.nodeId
    const withinThreshold = distMeters < ARRIVAL_THRESHOLD_M
    return atDestination || withinThreshold
  }, [active, activePoiDestination, currentNodeId, effectiveLocation, poiArrivalContext, route, routeResetPending])

  useEffect(() => {
    if (!active || routeKey === null || !arrivalCondition) return
    arrivalLatch.mark(routeKey)
  }, [active, arrivalCondition, arrivalLatch, routeKey])

  const arrived = active
    && routeKey !== null
    && (arrivalCondition || latchedRouteKey === routeKey)

  useEffect(() => {
    if (!arrived || arrivalNotifiedRef.current) return
    arrivalNotifiedRef.current = true
    onArrival?.()
  }, [arrived, onArrival])

  const isOffRoute = useMemo(() => {
    if (!active || !route || !position || !progress) return false
    return shouldWarnOffRoute({ mode: progressMode, accuracy: accuracyInput, distanceFromRouteM: haversine(position, progress.snappedPosition) })
  }, [accuracyInput, active, position, progress, progressMode, route])

  const navigationStatus = resolveNavigationStatus({ arrived, isOffRoute })

  return (
    <NavigationProvider
      location={effectiveLocation}
      heading={headingEnabled ? direction.heading : null}
      headingSource={headingEnabled ? direction.source : 'none'}
      headingStatus={headingEnabled ? direction.status : 'location-only'}
      canRequestHeadingPermission={canRequestPermission}
      enableHeading={enableDirection}
      buildingId={currentNodeBuildingId}
      floor={activeFloor}
      route={route}
      currentNodeId={currentNodeId}
      routeProgress={progress}
      sessionActive={active}
      isOffRoute={navigationStatus === 'off-route'}
      arrived={navigationStatus === 'arrived'}
      geoError={devLocationOverride ? null : geoError}
      progressMode={progressMode}
      progressLabel={progressModeLabel(progressMode)}
      gpsAccuracy={accuracyInput}
      gpsLostNotice={gpsLostNotice}
      nextStep={nextStep}
      previousStep={previousStep}
      anchorAtNode={anchorAtNode}
    >
      {children}
    </NavigationProvider>
  )
}
