import { describe, it, expect } from 'vitest'
import {
  LAYER_IDS, SOURCE_IDS, BUILDING_CATEGORY_COLORS, ROOM_CATEGORY_COLORS,
  ENTITY_ICON_COLORS, buildingFillPaint, roomFillPaint, entityCirclePaint,
} from './layers'

describe('LAYER_IDS', () => {
  it('contains all expected layer IDs', () => {
    const expected = ['BUILDING_FILL', 'BUILDING_OUTLINE', 'ROOM_FILL', 'ROOM_OUTLINE', 'HALLWAY_LINE', 'ROAD_LINE', 'ENTRANCE_ICON', 'STAIRCASE_ICON', 'ELEVATOR_ICON', 'PANORAMA_ICON', 'QR_ICON', 'SELECTION_OVERLAY', 'HOVER_HIGHLIGHT', 'PREVIEW', 'VALIDATION_OVERLAY']
    for (const key of expected) {
      expect(LAYER_IDS).toHaveProperty(key)
    }
  })

  it('has no duplicate values across LAYER_IDS', () => {
    const values = Object.values(LAYER_IDS)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('SOURCE_IDS', () => {
  it('contains all expected source IDs', () => {
    const expected = ['BUILDINGS', 'ROOMS', 'HALLWAYS', 'ROADS', 'ENTRANCES', 'STAIRCASES', 'ELEVATORS', 'PANORAMAS', 'QR', 'PREVIEW', 'SELECTION']
    for (const key of expected) {
      expect(SOURCE_IDS).toHaveProperty(key)
    }
  })

  it('has no duplicate values across SOURCE_IDS', () => {
    const values = Object.values(SOURCE_IDS)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('BUILDING_CATEGORY_COLORS', () => {
  it('has all expected building categories', () => {
    const expected = ['academic', 'residential', 'administrative', 'facility', 'library', 'dining', 'sports', 'parking', 'health', 'other']
    for (const cat of expected) {
      expect(BUILDING_CATEGORY_COLORS).toHaveProperty(cat)
      expect(BUILDING_CATEGORY_COLORS[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('ROOM_CATEGORY_COLORS', () => {
  it('has all expected room categories', () => {
    const expected = ['classroom', 'office', 'lab', 'restroom', 'stairwell', 'elevator_lobby', 'lobby', 'storage', 'meeting', 'auditorium', 'server', 'utility', 'other']
    for (const cat of expected) {
      expect(ROOM_CATEGORY_COLORS).toHaveProperty(cat)
      expect(ROOM_CATEGORY_COLORS[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('ENTITY_ICON_COLORS', () => {
  it('has all expected entity types', () => {
    const expected = ['entrance', 'staircase', 'elevator', 'panorama', 'qr']
    for (const key of expected) {
      expect(ENTITY_ICON_COLORS).toHaveProperty(key)
      expect(ENTITY_ICON_COLORS[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('buildingFillPaint', () => {
  it('returns correct paint with fill-opacity', () => {
    const paint = buildingFillPaint()
    expect(paint).toHaveProperty('fill-color')
    expect(paint).toHaveProperty('fill-opacity', 0.25)
  })
})

describe('roomFillPaint', () => {
  it('returns correct paint with match expression', () => {
    const paint = roomFillPaint()
    expect(paint).toHaveProperty('fill-color')
    expect(Array.isArray(paint['fill-color'])).toBe(true)
    expect(paint['fill-color'][0]).toBe('match')
    expect(paint).toHaveProperty('fill-opacity', 0.4)
  })
})

describe('entityCirclePaint', () => {
  it('returns correct color for known entity type', () => {
    const paint = entityCirclePaint('entrance')
    expect(paint['circle-color']).toBe('#FF8C00')
    expect(paint['circle-radius']).toBe(6)
  })

  it('returns fallback color for unknown entity type', () => {
    const paint = entityCirclePaint('unknown_type')
    expect(paint['circle-color']).toBe('#888')
  })
})
