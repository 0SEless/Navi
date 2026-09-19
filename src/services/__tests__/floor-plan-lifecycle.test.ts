import { describe, expect, it } from 'vitest'
import {
  areFloorPlanSourcesCompatible,
  buildFloorPlanReplaceAlignment,
  isOwnedFloorPlanUrl,
  resolveFloorPlanUrl,
} from '../floor-plan-lifecycle'

describe('floor-plan lifecycle policy', () => {
  it('preserves transforms only for finite source dimensions with a compatible aspect ratio', () => {
    expect(areFloorPlanSourcesCompatible({ width: 3000, height: 1200 }, { width: 1500, height: 600 })).toBe(true)
    expect(areFloorPlanSourcesCompatible({ width: 3000, height: 1200 }, { width: 1000, height: 1000 })).toBe(false)
    expect(areFloorPlanSourcesCompatible(undefined, { width: 1000, height: 1000 })).toBe(false)
  })

  it('resets only geometry for incompatible or unknown replacements', () => {
    const existing = { offset: { x: 4, y: -2 }, scaleX: 1.7, scaleY: 0.8, rotation: 35, opacity: 0.35, locked: true }
    expect(buildFloorPlanReplaceAlignment(existing, { width: 300, height: 100 }, { width: 600, height: 200 })).toEqual(existing)
    expect(buildFloorPlanReplaceAlignment(existing, { width: 300, height: 100 }, { width: 600, height: 600 })).toMatchObject({
      offset: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.35, locked: true,
    })
    expect(buildFloorPlanReplaceAlignment(existing, undefined, { width: 600, height: 200 })).toMatchObject({
      offset: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.35, locked: true,
    })
  })

  it('recognizes only owned managed floor-plan URLs', () => {
    expect(isOwnedFloorPlanUrl('https://storage.example/storage/v1/object/public/floor-plans/map/building/floor-0-a.png', {
      supabaseUrl: 'https://storage.example', mapId: 'map', buildingId: 'building', floorLevel: 0,
    })).toBe(true)
    expect(isOwnedFloorPlanUrl('data:image/png;base64,abc', {
      supabaseUrl: 'https://storage.example', mapId: 'map', buildingId: 'building', floorLevel: 0,
    })).toBe(false)
    expect(isOwnedFloorPlanUrl('https://storage.example/storage/v1/object/public/floor-plans/other/building/floor-0-a.png', {
      supabaseUrl: 'https://storage.example', mapId: 'map', buildingId: 'building', floorLevel: 0,
    })).toBe(false)
  })

  it('does not resurrect a legacy URL after an explicit floor-data removal', () => {
    expect(resolveFloorPlanUrl('legacy.png', { planImageId: null })).toBeUndefined()
    expect(resolveFloorPlanUrl('legacy.png', {})).toBe('legacy.png')
    expect(resolveFloorPlanUrl('legacy.png', { planImageId: undefined })).toBe('legacy.png')
    expect(resolveFloorPlanUrl(undefined, undefined, 'prop.png')).toBe('prop.png')
  })
})
