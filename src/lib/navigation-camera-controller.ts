import {
  getNavigationCameraMode,
  getNavigationCameraPolicy,
  getNavigationTransitionDuration,
  resetNavigationCompass,
  suspendFollowAfterPan,
  type NavigationCameraMode,
  type NavigationCameraSurface,
  type TopCameraOrientation,
} from '@/lib/navigation-camera-policy'

export type NavigationCameraCenter = [number, number]
export type NavigationCameraOffset = [number, number]

export interface NavigationCameraBounds {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export interface NavigationCameraEaseOptions {
  center?: NavigationCameraCenter
  pitch?: number
  bearing?: number
  offset?: NavigationCameraOffset
  duration: number
}

export interface NavigationCameraFitBoundsOptions {
  padding: { top: number; right: number; bottom: number; left: number }
  duration: number
  maxZoom?: number
}

export interface NavigationCameraHandler {
  enable: () => void
  disable: () => void
  isEnabled?: () => boolean
}

export interface NavigationCameraTouchZoomRotateHandler extends NavigationCameraHandler {
  enableRotation: () => void
  disableRotation: () => void
}

/** The small MapLibre surface the imperative controller is allowed to touch. */
export interface NavigationCameraMap {
  isStyleLoaded: () => boolean
  getBearing: () => number
  getPitch: () => number
  easeTo: (options: NavigationCameraEaseOptions) => void
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options: NavigationCameraFitBoundsOptions,
  ) => void
  on: (type: 'dragstart' | 'rotatestart', listener: () => void) => void
  off: (type: 'dragstart' | 'rotatestart', listener: () => void) => void
  dragPan: NavigationCameraHandler
  dragRotate: NavigationCameraHandler
  scrollZoom: NavigationCameraHandler
  doubleClickZoom: NavigationCameraHandler
  touchZoomRotate: NavigationCameraTouchZoomRotateHandler
  touchPitch: NavigationCameraHandler
}

export interface NavigationCameraUpdate {
  surface: NavigationCameraSurface
  mode: NavigationCameraMode
  topOrientation?: TopCameraOrientation
  position?: NavigationCameraCenter | null
  heading?: number | null
  routeBounds?: NavigationCameraBounds | null
  reducedMotion?: boolean
}

export interface NavigationCameraControllerState {
  mode: NavigationCameraMode
  topOrientation: TopCameraOrientation
  followSuspended: boolean
  headingFollowSuspended: boolean
  bearing: number
}

export interface NavigationCameraControllerOptions {
  reducedMotion?: boolean
  onSuspensionChange?: (suspended: boolean) => void
}

export interface NavigationCameraController {
  update: (input: NavigationCameraUpdate) => void
  recenter: (position?: NavigationCameraCenter | null, heading?: number | null) => void
  resetCompass: () => void
  fitRoute: (bounds: NavigationCameraBounds) => void
  getState: () => NavigationCameraControllerState
  destroy: () => void
}

const FOLLOW_OFFSET: NavigationCameraOffset = [0, 110]
const POV_OFFSET: NavigationCameraOffset = [0, 150]
const ROUTE_PREVIEW_PADDING = { top: 184, right: 32, bottom: 168, left: 32 }
const ROUTE_PREVIEW_DURATION_MS = 400
const ROUTE_PREVIEW_MAX_ZOOM = 18

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function isValidCenter(center: NavigationCameraCenter | null | undefined): center is NavigationCameraCenter {
  return center !== null
    && center !== undefined
    && isFiniteNumber(center[0])
    && isFiniteNumber(center[1])
}

function isValidBounds(bounds: NavigationCameraBounds | null | undefined): bounds is NavigationCameraBounds {
  return bounds !== null
    && bounds !== undefined
    && isFiniteNumber(bounds.minLng)
    && isFiniteNumber(bounds.maxLng)
    && isFiniteNumber(bounds.minLat)
    && isFiniteNumber(bounds.maxLat)
    && bounds.minLng <= bounds.maxLng
    && bounds.minLat <= bounds.maxLat
}

function offsetForMode(mode: NavigationCameraMode): NavigationCameraOffset | undefined {
  if (mode === 'FOLLOW') return FOLLOW_OFFSET
  if (mode === 'POV') return POV_OFFSET
  return undefined
}

function boundsKey(bounds: NavigationCameraBounds): string {
  return [bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat].join(':')
}

function cameraKey(options: Omit<NavigationCameraEaseOptions, 'duration'>): string {
  return JSON.stringify(options)
}

function applyHandler(handler: NavigationCameraHandler, enabled: boolean): void {
  if (enabled) handler.enable()
  else handler.disable()
}

function applyCameraHandlers(map: NavigationCameraMap, policy: ReturnType<typeof getNavigationCameraPolicy>): void {
  applyHandler(map.dragPan, policy.allowPan)
  applyHandler(map.scrollZoom, policy.allowZoom)
  applyHandler(map.doubleClickZoom, policy.allowZoom)
  applyHandler(map.dragRotate, policy.allowRotate)
  applyHandler(map.touchZoomRotate, policy.allowZoom)

  if (policy.allowRotate) map.touchZoomRotate.enableRotation()
  else map.touchZoomRotate.disableRotation()

  applyHandler(map.touchPitch, policy.allowPitch)
}

export function createNavigationCameraController(
  map: NavigationCameraMap,
  options: NavigationCameraControllerOptions = {},
): NavigationCameraController {
  const state: NavigationCameraControllerState = {
    mode: 'TOP',
    topOrientation: 'free',
    followSuspended: false,
    headingFollowSuspended: false,
    bearing: map.getBearing(),
  }

  let destroyed = false
  let handlersApplied = false
  let hasUpdated = false
  let lastCameraKey: string | null = null
  let lastRouteBoundsKey: string | null = null
  let reducedMotion = options.reducedMotion === true

  const handleManualPan = (): void => {
    if (destroyed) return

    const shouldSuspend = suspendFollowAfterPan(state.mode)
      || (state.mode === 'TOP' && state.topOrientation === 'heading-follow')
    if (!shouldSuspend || state.followSuspended) return

    state.followSuspended = true
    state.headingFollowSuspended = true
    options.onSuspensionChange?.(true)
  }

  const handleManualRotate = (): void => {
    if (destroyed) return
    // Only suspend heading-follow when the user manually rotates in a mode that follows heading
    if (state.mode === 'TOP' && state.topOrientation !== 'heading-follow') return
    if (state.mode === 'POV') return
    state.headingFollowSuspended = true
  }

  map.on('dragstart', handleManualPan)
  map.on('rotatestart', handleManualRotate)

  // After any gesture, enforce pitch lock in FOLLOW/POV
  const handleMoveEnd = (): void => {
    if (destroyed) return
    if (state.mode !== 'FOLLOW' && state.mode !== 'POV') return
    const targetPitch = state.mode === 'POV' ? 85 : 60
    const currentPitch = map.getPitch()
    if (Math.abs(currentPitch - targetPitch) > 0.5) {
      map.easeTo({ pitch: targetPitch, duration: 200 })
    }
  }
  map.on('moveend', handleMoveEnd)

  const isReady = (): boolean => !destroyed && map.isStyleLoaded()

  const clearSuspension = (): void => {
    const hadFollowSuspension = state.followSuspended
    state.followSuspended = false
    state.headingFollowSuspended = false
    if (hadFollowSuspension) options.onSuspensionChange?.(false)
  }

  const applyCamera = (
    target: Omit<NavigationCameraEaseOptions, 'duration'>,
    duration: number,
  ): void => {
    const nextKey = cameraKey(target)
    if (nextKey === lastCameraKey) return
    map.easeTo({ ...target, duration })
    lastCameraKey = nextKey
    if (target.bearing !== undefined) state.bearing = target.bearing
  }

  const fitRoute = (bounds: NavigationCameraBounds): void => {
    if (!isReady() || !isValidBounds(bounds)) return
    const nextBoundsKey = boundsKey(bounds)
    if (nextBoundsKey === lastRouteBoundsKey) return

    map.fitBounds(
      [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
      {
        padding: ROUTE_PREVIEW_PADDING,
        duration: reducedMotion ? 0 : ROUTE_PREVIEW_DURATION_MS,
        maxZoom: ROUTE_PREVIEW_MAX_ZOOM,
      },
    )
    lastRouteBoundsKey = nextBoundsKey
  }

  const update = (input: NavigationCameraUpdate): void => {
    if (!isReady()) return

    reducedMotion = input.reducedMotion ?? options.reducedMotion === true
    const nextMode = getNavigationCameraMode({
      surface: input.surface,
      temporaryMode: input.mode,
      contextDefaultMode: input.mode,
    })
    const nextTopOrientation = input.surface === 'explore' || input.surface === 'route-preview'
      ? 'free'
      : input.topOrientation ?? 'free'
    const modeChanged = !hasUpdated
      || nextMode !== state.mode
      || nextTopOrientation !== state.topOrientation

    if (modeChanged) {
      clearSuspension()
      lastCameraKey = null
      lastRouteBoundsKey = null
    }

    state.mode = nextMode
    state.topOrientation = nextTopOrientation

    const currentBearing = map.getBearing()
    const policy = getNavigationCameraPolicy({
      mode: nextMode,
      surface: input.surface,
      topOrientation: nextTopOrientation,
      heading: input.heading,
      currentBearing,
      followSuspended: state.followSuspended,
      headingFollowSuspended: state.headingFollowSuspended,
      reducedMotion,
    })

    applyCameraHandlers(map, policy)
    handlersApplied = true

    if (input.surface === 'route-preview' && input.routeBounds) fitRoute(input.routeBounds)

    if (!modeChanged && !policy.followsPosition && state.mode !== 'TOP') {
      // Still apply pitch and bearing even when position follow is suspended
      const target: Omit<NavigationCameraEaseOptions, 'duration'> = {
        pitch: policy.pitch,
        bearing: policy.bearing,
      }
      applyCamera(target, 0)
      hasUpdated = true
      return
    }

    const target: Omit<NavigationCameraEaseOptions, 'duration'> = {
      pitch: policy.pitch,
      bearing: policy.bearing,
    }
    // Set preferred zoom when switching modes (user can still zoom freely)
    if (modeChanged) {
      if (policy.mode === 'POV') target.zoom = 19
      else if (policy.mode === 'FOLLOW') target.zoom = 18
      else if (policy.mode === 'TOP') target.zoom = 17
    }
    const offset = offsetForMode(policy.mode)
    if (offset) target.offset = offset
    if (policy.followsPosition && isValidCenter(input.position)) target.center = input.position

    const duration = modeChanged
      ? getNavigationTransitionDuration(reducedMotion)
      : policy.transitionDurationMs === 0
        ? 0
        : 220
    applyCamera(target, duration)
    hasUpdated = true
  }

  const recenter = (position?: NavigationCameraCenter | null, heading?: number | null): void => {
    if (!isReady()) return
    clearSuspension()

    const policy = getNavigationCameraPolicy({
      mode: state.mode,
      surface: 'active',
      topOrientation: state.topOrientation,
      heading,
      currentBearing: map.getBearing(),
      followSuspended: false,
      headingFollowSuspended: false,
      reducedMotion,
    })
    const target: Omit<NavigationCameraEaseOptions, 'duration'> = {
      pitch: policy.pitch,
      bearing: policy.bearing,
    }
    const offset = offsetForMode(policy.mode)
    if (offset) target.offset = offset
    // Recenter ALWAYS centers on user's position — that's its purpose
    if (isValidCenter(position)) target.center = position

    lastCameraKey = null
    applyCamera(target, getNavigationTransitionDuration(reducedMotion))
  }

  const resetCompass = (): void => {
    if (!isReady()) return

    const reset = resetNavigationCompass({
      mode: state.mode,
      topOrientation: state.topOrientation,
      heading: null,
      currentBearing: map.getBearing(),
    })
    const hadFollowSuspension = state.followSuspended
    state.followSuspended = reset.followSuspended
    state.headingFollowSuspended = reset.headingFollowSuspended
    if (hadFollowSuspension) options.onSuspensionChange?.(false)

    const policy = getNavigationCameraPolicy({
      mode: state.mode,
      surface: 'active',
      topOrientation: state.topOrientation,
      heading: null,
      currentBearing: reset.bearing,
      followSuspended: state.followSuspended,
      headingFollowSuspended: state.headingFollowSuspended,
      reducedMotion,
    })
    const target: Omit<NavigationCameraEaseOptions, 'duration'> = {
      pitch: policy.pitch,
      bearing: reset.bearing,
    }
    const offset = offsetForMode(policy.mode)
    if (offset) target.offset = offset

    lastCameraKey = null
    applyCamera(target, getNavigationTransitionDuration(reducedMotion))
  }

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    map.off('dragstart', handleManualPan)
    map.off('rotatestart', handleManualRotate)
    map.off('moveend', handleMoveEnd)
  }

  return {
    update,
    recenter,
    resetCompass,
    fitRoute,
    getState: () => ({ ...state }),
    destroy,
  }
}
