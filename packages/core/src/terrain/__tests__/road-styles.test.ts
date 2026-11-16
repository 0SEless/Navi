import { describe, expect, it } from 'vitest'
import { DEFAULT_ROAD_STYLE, ROAD_STYLES, isRoadStyle, roadStyleSpec } from '../road-styles'

describe('road styles', () => {
  it('offers six designs, Campus walkway by default (owner 2026-11-17)', () => {
    expect(ROAD_STYLES).toEqual(['walkway', 'standard', 'campus', 'night', 'brick', 'minimal'])
    expect(DEFAULT_ROAD_STYLE).toBe('walkway')
  })

  it('Campus walkway: warm paved footpaths with a darker edge; grey roads, no edge lines, a thin solid yellow centre', () => {
    expect(roadStyleSpec('walkway')).toMatchObject({ label: 'Campus walkway', path: '#efe6d6', pathEdge: '#c9b79a', road: '#8a8f96', edge: null, centre: '#f2c94c', centreDash: null })
  })

  it('only Campus walkway edges its footpaths', () => {
    for (const s of ROAD_STYLES.filter((x) => x !== 'walkway')) expect(roadStyleSpec(s).pathEdge).toBeNull()
  })

  it('standard keeps today\'s look: asphalt, white edges and a white dashed centre', () => {
    expect(roadStyleSpec('standard')).toMatchObject({ road: '#4b4f55', edge: '#ffffff', centre: '#ffffff', centreDash: [4, 4] })
  })

  it('each design has its own road colour; brick and minimal have no markings', () => {
    const roads = ROAD_STYLES.filter((s) => s !== 'walkway').map((s) => roadStyleSpec(s).road)
    expect(new Set(roads).size).toBe(5)
    for (const s of ['brick', 'minimal'] as const) expect(roadStyleSpec(s)).toMatchObject({ edge: null, centre: null })
    expect(roadStyleSpec('campus')).toMatchObject({ edge: null, centreDash: null })
  })

  it('knows its names; unknown falls back to the default', () => {
    expect(isRoadStyle('night')).toBe(true)
    expect(isRoadStyle('neon')).toBe(false)
    expect(roadStyleSpec('neon' as never).label).toBe('Campus walkway')
  })
})
