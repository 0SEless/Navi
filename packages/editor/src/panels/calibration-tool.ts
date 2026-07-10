import type { Tool, ToolPointerEvent, ToolContext } from '../tools'
import type { CalibrationResult, ControlPoint } from '@navi/core'
import { CalibrationEngine } from '@navi/core'

export interface CalibrationState {
  floorId: string
  buildingId: string
  controlPoints: ControlPoint[]
  imageWidth: number
  imageHeight: number
  imageUrl: string
  result: CalibrationResult | null
}

export function createEmptyState(floorId: string, buildingId: string): CalibrationState {
  return {
    floorId,
    buildingId,
    controlPoints: [],
    imageWidth: 0,
    imageHeight: 0,
    imageUrl: '',
    result: null,
  }
}

export type CalibrationStateListener = (state: CalibrationState) => void

export const calibrationTool: Tool = {
  id: 'calibrate',
  label: 'Calibrate Floor',
  cursor: 'crosshair',

  onActivate(ctx: ToolContext): void {
    ctx.services.eventBus.emit('calibration.activated', { floorId: ctx.services.viewport.activeFloorId, buildingId: ctx.services.viewport.activeBuildingId })
  },

  onDeactivate(ctx: ToolContext): void {
    ctx.services.eventBus.emit('calibration.deactivated', {})
  },

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.services.eventBus.emit('calibration.addPoint', {
      world: { lat: event.lat, lng: event.lng },
      pixel: { x: event.x, y: event.y },
    })
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      ctx.services.eventBus.emit('calibration.removeLastPoint', {})
    }
    if (event.key === 'Enter') {
      ctx.services.eventBus.emit('calibration.compute', {})
    }
    if (event.key === 'Escape') {
      ctx.services.eventBus.emit('calibration.cancel', {})
    }
  },
}

export function computeCalibration(
  state: CalibrationState,
  buildingLocalOrigin: { lat: number; lng: number },
): CalibrationState {
  const engine = new CalibrationEngine()
  const result = engine.calibrate(
    {
      floorId: state.floorId,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      controlPoints: state.controlPoints,
      buildingId: state.buildingId,
    },
    buildingLocalOrigin,
  )
  return { ...state, result }
}

export function addControlPoint(state: CalibrationState, world: { lat: number; lng: number }, pixel: { x: number; y: number }): CalibrationState {
  return {
    ...state,
    controlPoints: [...state.controlPoints, { world, pixel }],
    result: null,
  }
}

export function removeLastControlPoint(state: CalibrationState): CalibrationState {
  if (state.controlPoints.length === 0) return state
  return {
    ...state,
    controlPoints: state.controlPoints.slice(0, -1),
    result: null,
  }
}
