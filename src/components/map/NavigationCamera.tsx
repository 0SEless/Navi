'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NavigationCameraControls, {
  type NavigationCameraControlsProps,
  type NavigationHeadingStatus,
} from './NavigationCameraControls'
import { useNavigationMap } from './NavigationMap'
import { useOptionalNavigationContext } from './NavigationContext'
import {
  createNavigationCameraController,
  type NavigationCameraBounds,
  type NavigationCameraCenter,
  type NavigationCameraController,
  type NavigationCameraMap,
} from '@/lib/navigation-camera-controller'
import {
  isNavigationCompassVisible,
  type NavigationCameraMode,
  type NavigationCameraSurface,
  type TopCameraOrientation,
} from '@/lib/navigation-camera-policy'

export interface NavigationCameraProps {
  surface: NavigationCameraSurface
  mode: NavigationCameraMode
  topOrientation?: TopCameraOrientation
  position?: NavigationCameraCenter | null
  heading?: number | null
  bearing?: number | null
  routeBounds?: NavigationCameraBounds | null
  reducedMotion?: boolean
  showControls?: boolean
  controlsClassName?: string
  suspended?: boolean
  headingStatus?: NavigationHeadingStatus
  canRequestHeadingPermission?: boolean
  headingFollowEnabled?: boolean
  onModeChange?: (mode: NavigationCameraMode) => void
  onRecenter?: () => void
  onResetCompass?: () => void
  onToggleHeadingFollow?: (enabled: boolean) => void
  onRequestHeadingPermission?: () => void
}

export type NavigationCameraConfig = NavigationCameraProps

function contextPositionToCenter(
  position: { lat: number; lng: number } | null | undefined,
): NavigationCameraCenter | null | undefined {
  return position ? [position.lng, position.lat] : position
}

function toControllerMap(map: unknown): NavigationCameraMap {
  return map as NavigationCameraMap
}

function defaultHeadingFollowEnabled(
  surface: NavigationCameraSurface,
  mode: NavigationCameraMode,
  topOrientation: TopCameraOrientation,
): boolean {
  return surface === 'active' && (mode === 'TOP' ? topOrientation === 'heading-follow' : true)
}

/** React lifecycle bridge for the imperative navigation camera controller. */
export default function NavigationCamera({
  surface,
  mode,
  topOrientation = 'free',
  position,
  heading = null,
  bearing = null,
  routeBounds = null,
  reducedMotion = false,
  showControls = true,
  controlsClassName,
  suspended: suspendedProp,
  headingStatus = 'none',
  canRequestHeadingPermission = false,
  headingFollowEnabled,
  onModeChange,
  onRecenter,
  onResetCompass,
  onToggleHeadingFollow,
  onRequestHeadingPermission,
}: NavigationCameraProps) {
  const { map, isReady } = useNavigationMap()
  const navigationContext = useOptionalNavigationContext()
  const controllerRef = useRef<NavigationCameraController | null>(null)
  const [modeSelection, setModeSelection] = useState<{
    sourceMode: NavigationCameraMode
    sourceSurface: NavigationCameraSurface
    value: NavigationCameraMode
  }>(() => ({
    sourceMode: mode,
    sourceSurface: surface,
    value: surface === 'active' ? mode : 'TOP',
  }))
  const [suspendedState, setSuspendedState] = useState(false)
  const defaultHeadingFollow = defaultHeadingFollowEnabled(surface, mode, topOrientation)
  const defaultHeadingFollowKey = `${surface}:${mode}:${topOrientation}`
  const [headingFollowSelection, setHeadingFollowSelection] = useState<{
    defaultKey: string
    sourceValue: boolean | undefined
    value: boolean
  }>(() => ({
    defaultKey: defaultHeadingFollowKey,
    sourceValue: headingFollowEnabled,
    value: headingFollowEnabled ?? defaultHeadingFollow,
  }))

  const contextPosition = contextPositionToCenter(navigationContext?.location)
  const effectivePosition = position !== undefined ? position : contextPosition
  const effectiveMode = surface === 'active'
    ? modeSelection.sourceMode === mode && modeSelection.sourceSurface === surface
      ? modeSelection.value
      : mode
    : 'TOP'
  const effectiveSuspended = suspendedProp ?? suspendedState
  const effectiveHeadingFollowEnabled = headingFollowSelection.sourceValue === headingFollowEnabled
    && (headingFollowEnabled !== undefined || headingFollowSelection.defaultKey === defaultHeadingFollowKey)
    ? headingFollowSelection.value
    : headingFollowEnabled ?? defaultHeadingFollow

  const handleSuspensionChange = useCallback((suspended: boolean) => {
    setSuspendedState(suspended)
  }, [])

  useEffect(() => {
    if (!map || !isReady) {
      controllerRef.current?.destroy()
      controllerRef.current = null
      return
    }

    const controller = createNavigationCameraController(toControllerMap(map), {
      reducedMotion,
      onSuspensionChange: handleSuspensionChange,
    })
    controllerRef.current = controller

    return () => {
      controller.destroy()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [handleSuspensionChange, isReady, map, reducedMotion])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    controller.update({
      surface,
      mode: effectiveMode,
      topOrientation,
      position: effectivePosition,
      heading,
      headingFollowEnabled: effectiveHeadingFollowEnabled,
      routeBounds,
      reducedMotion,
    })
  }, [effectiveHeadingFollowEnabled, effectiveMode, effectivePosition, heading, isReady, reducedMotion, routeBounds, surface, topOrientation])

  const compassBearing = bearing ?? heading ?? null
  const compassVisible = isNavigationCompassVisible(compassBearing)
  const hasLocation = effectivePosition !== null && effectivePosition !== undefined

  const handleModeChange = useCallback((nextMode: NavigationCameraMode) => {
    if (surface !== 'active') return
    setModeSelection({
      sourceMode: mode,
      sourceSurface: surface,
      value: nextMode,
    })
    onModeChange?.(nextMode)
  }, [mode, onModeChange, surface])

  const handleRecenter = useCallback(() => {
    controllerRef.current?.recenter(effectivePosition, heading)
    onRecenter?.()
  }, [effectivePosition, heading, onRecenter])

  const handleResetCompass = useCallback(() => {
    controllerRef.current?.resetCompass()
    onResetCompass?.()
  }, [onResetCompass])

  const handleToggleHeadingFollow = useCallback((enabled: boolean) => {
    if (surface !== 'active') return
    setHeadingFollowSelection({
      defaultKey: defaultHeadingFollowKey,
      sourceValue: headingFollowEnabled,
      value: enabled,
    })
    controllerRef.current?.setHeadingFollowEnabled(enabled, heading)
    onToggleHeadingFollow?.(enabled)
  }, [defaultHeadingFollowKey, heading, headingFollowEnabled, onToggleHeadingFollow, surface])

  const controlProps = useMemo<NavigationCameraControlsProps>(() => ({
    surface,
    mode: effectiveMode,
    className: controlsClassName,
    hasLocation,
    compassVisible,
    suspended: effectiveSuspended,
    headingStatus,
    canRequestHeadingPermission,
    reducedMotion,
    headingFollowEnabled: effectiveHeadingFollowEnabled,
    onModeChange: handleModeChange,
    onRecenter: handleRecenter,
    onResetCompass: handleResetCompass,
    onToggleHeadingFollow: handleToggleHeadingFollow,
    onRequestHeadingPermission,
  }), [
    canRequestHeadingPermission,
    compassVisible,
    effectiveMode,
    effectiveSuspended,
    handleModeChange,
    handleRecenter,
    handleResetCompass,
    hasLocation,
    effectiveHeadingFollowEnabled,
    headingStatus,
    handleToggleHeadingFollow,
    onRequestHeadingPermission,
    reducedMotion,
    surface,
    controlsClassName,
  ])

  if (!isReady || !map || !showControls) return null
  return <NavigationCameraControls {...controlProps} />
}
