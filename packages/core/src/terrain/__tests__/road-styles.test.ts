import { describe, expect, it } from 'vitest'
import { DEFAULT_ROAD_STYLE, ROAD_STYLES, isRoadStyle, roadStyleSpec } from '../road-styles'

describe('road styles', () => {
  it('offers five designs, standard by default', () => {
    expect(ROAD_STYLES).toEqual(['standard', 'campus', 'night', 'brick', 'minimal'])
    expect(DEFAULT_ROAD_STYLE).toBe('standard')
  })

  it('standard keeps today\'s look: asphalt, white edges and a white dashed centre', () => {
    expect(roadStyleSpec('standard')).toMatchObject({ road: '#4b4f55', edge: '#ffffff', centre: '#ffffff', centreDash: [4, 4] })
  })

  it('each design has its own road colour; brick and minimal have no markings', () => {
    const roads = ROAD_STYLES.map((s) => roadStyleSpec(s).road)
    expect(new Set(roads).size).toBe(5)
    for (const s of ['brick', 'minimal'] as const) expect(roadStyleSpec(s)).toMatchObject({ edge: null, centre: null })
    expect(roadStyleSpec('campus')).toMatchObject({ edge: null, centreDash: null })
  })

  it('knows its names; unknown falls back to standard', () => {
    expect(isRoadStyle('night')).toBe(true)
    expect(isRoadStyle('neon')).toBe(false)
    expect(roadStyleSpec('neon' as never).label).toBe('Standard')
  })
})
