import { normalizeCaptureHeading } from '@/features/capture/direction'
import type { NavigationMapView } from '@/lib/public-preferences'

export type NavigationCameraMode = 'TOP' | 'FOLLOW' | 'POV'
export type TopCameraOrientation = 'free' | 'heading-follow'
export type NavigationCameraSurface = 'explore' | 'route-preview' | 'active'

export interface NavigationCameraPolicyInput {
  mode: NavigationCameraMode
  surface?: NavigationCameraSurface
  topOrientation?: TopCameraOrientation
  heading?: number | null
  currentBearing?: number | null
  followSuspended?: boolean
  headingFollowSuspended?: boolean
  reducedMotion?: boolean
}

export interface NavigationCameraPolicy {
  mode: NavigationCameraMode
  pitch: number
  bearing: number
  allowPan: boolean
  allowZoom: boolean
  allowRotate: boolean
  allowPitch: boolean
  followsPosition: boolean
  followsHeading: boolean
  transitionDurationMs: number
}

export interface NavigationCameraModeSelectionInput {
  surface: NavigationCameraSurface
  temporaryMode?: NavigationCameraMode | null
  contextDefaultMode?: NavigationCameraMode | null
  storedDefaultMapView?: NavigationMapView | null
}

export const NAVIGATION_CAMERA_MODE_TRANSITION_MS = 360
export const NAVIGATION_CAMERA_CONTINUOUS_TRANSITION_MS = 220
export const NAVIGATION_COMPASS_DEADBAND_DEGREES = 3

function bearingFor(input: NavigationCameraPolicyInput, followHeading: boolean): number {
  const heading = normalizeCaptureHeading(input.heading)
  if (followHeading && heading !== null) return heading
  return normalizeCaptureHeading(input.currentBearing) ?? 0
}

function modeFromStoredPreference(view: NavigationMapView | null | undefined): NavigationCameraMode | null {
  if (view === 'top') return 'TOP'
  if (view === 'follow') return 'FOLLOW'
  if (view === 'pov') return 'POV'
  return null
}

/** Resolve a camera mode without allowing route preview to become follow mode. */
export function getNavigationCameraMode(input: NavigationCameraModeSelectionInput): NavigationCameraMode {
  if (input.surface === 'explore' || input.surface === 'route-preview') return 'TOP'
  return input.temporaryMode
    ?? input.contextDefaultMode
    ?? modeFromStoredPreference(input.storedDefaultMapView)
    ?? 'FOLLOW'
}

export function getNavigationTransitionDuration(reducedMotion = false): number {
  return reducedMotion ? 0 : NAVIGATION_CAMERA_MODE_TRANSITION_MS
}

export function isNavigationCompassVisible(bearing: number | null | undefined): boolean {
  const normalized = normalizeCaptureHeading(bearing)
  if (normalized === null) return false
  const delta = Math.min(normalized, 360 - normalized)
  return delta > NAVIGATION_COMPASS_DEADBAND_DEGREES
}

export function getNavigationCameraPolicy(
  input: NavigationCameraPolicyInput,
): NavigationCameraPolicy {
  const mode = input.surface === 'route-preview' || input.surface === 'explore' ? 'TOP' : input.mode
  const topOrientation = input.surface === 'route-preview' || input.surface === 'explore'
    ? 'free'
    : input.topOrientation ?? 'free'
  const followSuspended = input.followSuspended === true
  const headingFollowSuspended = input.headingFollowSuspended === true
  const headingAvailable = normalizeCaptureHeading(input.heading) !== null
  const wantsHeadingFollow = mode === 'TOP'
    ? topOrientation === 'heading-follow'
    : true
  const followsHeading = wantsHeadingFollow
    && headingAvailable
    && !followSuspended
    && !headingFollowSuspended

  if (mode === 'TOP') {
    return {
      mode,
      pitch: 0,
      bearing: bearingFor(input, followsHeading),
      allowPan: true,
      allowZoom: true,
      allowRotate: true,
      allowPitch: false,
      followsPosition: topOrientation === 'heading-follow' && !followSuspended,
      followsHeading,
      transitionDurationMs: getNavigationTransitionDuration(input.reducedMotion),
    }
  }

  return {
    mode,
    pitch: mode === 'FOLLOW' ? 60 : 85,
    bearing: bearingFor(input, followsHeading),
    allowPan: mode === 'FOLLOW',
    allowZoom: true,
    allowRotate: mode === 'FOLLOW',
    allowPitch: false,
    followsPosition: !followSuspended,
    followsHeading,
    transitionDurationMs: getNavigationTransitionDuration(input.reducedMotion),
  }
}

export function recenterNavigationCamera(input: Pick<
  NavigationCameraPolicyInput,
  'mode' | 'topOrientation' | 'heading' | 'currentBearing'
>): { bearing: number; followSuspended: false } {
  const policy = getNavigationCameraPolicy({ ...input, followSuspended: false })
  return { bearing: policy.bearing, followSuspended: false }
}

export function resetNavigationCompass(input: Pick<
  NavigationCameraPolicyInput,
  'mode' | 'topOrientation' | 'heading' | 'currentBearing'
>): { bearing: number; followSuspended: false; headingFollowSuspended: boolean } {
  return {
    bearing: 0,
    followSuspended: false,
    headingFollowSuspended: input.mode !== 'TOP' || (input.topOrientation ?? 'free') === 'heading-follow',
  }
}

export function suspendFollowAfterPan(mode: NavigationCameraMode): boolean {
  return mode === 'POV'
}
