import { describe, expect, it } from 'vitest'
import { DEFAULT_TERRAIN_LOOK, TERRAIN_LOOKS, isTerrainLook, terrainLookRelief, terrainLookStyle } from '../map-looks'

describe('terrain map looks (NAVI Web presets)', () => {
  it('offers green terraces (default), vivid green, neutral and sand heights', () => {
    expect(TERRAIN_LOOKS).toEqual(['green', 'vivid', 'neutral', 'sand'])
    expect(DEFAULT_TERRAIN_LOOK).toBe('green')
    expect(TERRAIN_LOOKS.map((look) => terrainLookStyle(look).label)).toEqual(['Green terraces', 'Vivid green', 'Neutral', 'Sand heights'])
    expect(isTerrainLook('vivid')).toBe(true)
    expect(isTerrainLook('purple')).toBe(false)
  })

  it('neutral matches the terrain editor ground and has no height colours', () => {
    expect(terrainLookStyle('neutral').ground).toBe('#e9e3d6')
    expect(terrainLookRelief('neutral', 0, 20)).toBeNull()
  })

  it('height colours run from the lowest to the highest ground, lighter at the top for the greens', () => {
    const stops = terrainLookRelief('green', 2, 22)!
    expect(stops[0][0]).toBe(2)
    expect(stops.at(-1)![0]).toBe(22)
    expect(stops.map((s) => s[0])).toEqual([...stops.map((s) => s[0])].sort((a, b) => a - b))
    const sand = terrainLookRelief('sand', 0, 10)!
    expect(sand.map((s) => s[1])).toEqual(['#ece3cf', '#c9ab80', '#8a6a48'])
  })

  it('a flat campus (min = max) still gets increasing stops', () => {
    const stops = terrainLookRelief('vivid', 5, 5)!
    for (let i = 1; i < stops.length; i++) expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0])
  })
})
