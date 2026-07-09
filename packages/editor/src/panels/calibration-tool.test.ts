import { describe, it, expect } from 'vitest'
import { createEmptyState, addControlPoint, removeLastControlPoint, computeCalibration } from './calibration-tool'

describe('calibration state', () => {
  it('creates empty state', () => {
    const state = createEmptyState('flr-1', 'bld-1')
    expect(state.floorId).toBe('flr-1')
    expect(state.buildingId).toBe('bld-1')
    expect(state.controlPoints).toHaveLength(0)
    expect(state.result).toBeNull()
  })

  it('adds control points', () => {
    let state = createEmptyState('flr-1', 'bld-1')
    state = addControlPoint(state, { lat: 10, lng: 20 }, { x: 100, y: 200 })
    expect(state.controlPoints).toHaveLength(1)
    expect(state.controlPoints[0].world.lat).toBe(10)
    expect(state.controlPoints[0].pixel.x).toBe(100)
  })

  it('removes last control point', () => {
    let state = createEmptyState('flr-1', 'bld-1')
    state = addControlPoint(state, { lat: 10, lng: 20 }, { x: 100, y: 200 })
    state = addControlPoint(state, { lat: 11, lng: 21 }, { x: 150, y: 250 })
    expect(state.controlPoints).toHaveLength(2)
    state = removeLastControlPoint(state)
    expect(state.controlPoints).toHaveLength(1)
    expect(state.controlPoints[0].world.lat).toBe(10)
  })

  it('does nothing removing from empty', () => {
    let state = createEmptyState('flr-1', 'bld-1')
    state = removeLastControlPoint(state)
    expect(state.controlPoints).toHaveLength(0)
  })

  it('computes calibration with 2+ points', () => {
    let state = createEmptyState('flr-1', 'bld-1')
    state = { ...state, imageWidth: 1000, imageHeight: 800 }
    state = addControlPoint(state, { lat: 10, lng: 20 }, { x: 100, y: 200 })
    state = addControlPoint(state, { lat: 10.001, lng: 20.001 }, { x: 200, y: 300 })
    const result = computeCalibration(state, { lat: 10, lng: 20 })
    expect(result.result).not.toBeNull()
    expect(result.result!.scale).toBeGreaterThan(0)
    expect(result.result!.confidence).toBeGreaterThanOrEqual(0)
  })
})
