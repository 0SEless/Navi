import { describe, expect, it } from 'vitest'
import { DOOR_PRESETS, GLASS_STYLES, OPENING_MATERIAL_COLORS, findDoorPreset } from '../opening-catalog'
import { resolveDoorStyle } from '../opening-style'

describe('door catalog', () => {
  it('has the 11 door presets with unique ids and the labels from the spec table', () => {
    expect(DOOR_PRESETS.map(p => [p.id, p.label])).toEqual([
      ['door.wood.single', 'Wood door'], ['door.wood.half-glass', 'Half-glass wood door'], ['door.steel.single', 'Steel door'],
      ['door.fire.single', 'Fire door'], ['door.glass.single', 'Glass door'], ['door.wood.double', 'Double wood door'],
      ['door.glass.double', 'Double glass door'], ['door.glass.sliding', 'Sliding glass door'], ['door.folding', 'Folding door'],
      ['door.rollup', 'Roll-up shutter'], ['door.archway', 'Archway'],
    ])
    expect(new Set(DOOR_PRESETS.map(p => p.id)).size).toBe(11)
  })
  it('uses the fixed palette', () => {
    expect(OPENING_MATERIAL_COLORS).toEqual({ wood: '#8B5E3C', 'painted-steel': '#6B7280', aluminium: '#C0C7CF', 'fire-red': '#B91C1C' })
    expect(GLASS_STYLES.clear.opacity).toBe(0.35); expect(GLASS_STYLES.frosted.opacity).toBe(0.55); expect(GLASS_STYLES.tinted.opacity).toBe(0.45)
  })
  it('resolveDoorStyle applies preset defaults, then explicit material/glass override them', () => {
    expect(resolveDoorStyle({ doorType: 'standard', assetPreset: 'door.glass.sliding' })).toMatchObject({ operation: 'sliding', panel: 'glass', material: 'aluminium', leaves: 1 })
    expect(resolveDoorStyle({ doorType: 'standard', assetPreset: 'door.wood.double' })).toMatchObject({ operation: 'hinged', leaves: 2, material: 'wood' })
    expect(resolveDoorStyle({ doorType: 'standard', assetPreset: 'door.wood.half-glass' }).panel).toBe('half-glass')
    expect(resolveDoorStyle({ doorType: 'standard', assetPreset: 'door.glass.single', material: 'painted-steel', glass: 'frosted' })).toMatchObject({ material: 'painted-steel', glass: 'frosted' })
  })
  it('unknown assetPreset falls back to today\'s look and does not throw', () => {
    expect(findDoorPreset('door.castle')).toBeUndefined()
    expect(resolveDoorStyle({ doorType: 'standard', assetPreset: 'door.castle' })).toMatchObject({ operation: 'hinged', panel: 'solid', material: null })
  })
  it('archway doorType still wins over a preset', () => {
    expect(resolveDoorStyle({ doorType: 'opening', assetPreset: 'door.wood.single' }).operation).toBe('none')
  })
})
