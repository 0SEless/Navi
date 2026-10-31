import { describe, expect, it } from 'vitest'
import { parsePartKey, partKey, zoneOf } from './part-keys'

describe('partKey / parsePartKey', () => {
  it('round-trips ids containing reserved characters', () => {
    const key = partKey('floor', 'B:1', 'F/2')
    expect(key).toBe('floor:B%3A1:F%2F2')
    expect(parsePartKey(key)).toEqual({ kind: 'floor', ids: ['B:1', 'F/2'] })
  })

  it('keeps the slash in map kinds and encodes ids', () => {
    expect(partKey('map/road', 'r-12')).toBe('map/road:r-12')
    expect(parsePartKey('map/road:r-12')).toEqual({ kind: 'map/road', ids: ['r-12'] })
  })

  it('supports zero-id kinds', () => {
    expect(partKey('campus')).toBe('campus')
    expect(partKey('terrain')).toBe('terrain')
    expect(parsePartKey('campus')).toEqual({ kind: 'campus', ids: [] })
    expect(parsePartKey('terrain')).toEqual({ kind: 'terrain', ids: [] })
  })

  it('throws on unknown kinds', () => {
    expect(() => parsePartKey('panorama:x')).toThrow()
    expect(() => parsePartKey('')).toThrow()
  })

  it('throws on wrong arity in both directions', () => {
    expect(() => partKey('campus', 'x')).toThrow()
    expect(() => partKey('terrain', 'x')).toThrow()
    expect(() => partKey('building')).toThrow()
    expect(() => partKey('building', 'a', 'b')).toThrow()
    expect(() => partKey('floor', 'a')).toThrow()
    expect(() => partKey('terrain-tile')).toThrow()
    expect(() => partKey('map/poi', 'a', 'b')).toThrow()
    expect(() => parsePartKey('campus:x')).toThrow()
    expect(() => parsePartKey('building')).toThrow()
    expect(() => parsePartKey('floor:a')).toThrow()
    expect(() => parsePartKey('floor:a:b:c')).toThrow()
    expect(() => parsePartKey('map/poi:a:b')).toThrow()
  })

  it('throws on empty ids', () => {
    expect(() => partKey('building', '')).toThrow()
    expect(() => partKey('floor', 'B1', '')).toThrow()
    expect(() => parsePartKey('building:')).toThrow()
    expect(() => parsePartKey('floor:B1:')).toThrow()
  })
})

describe('zoneOf', () => {
  it('maps parts to their zone', () => {
    expect(zoneOf('floor:B1:F2')).toBe('building:B1')
    expect(zoneOf('building:B1')).toBe('building:B1')
    expect(zoneOf('terrain-tile:t1')).toBe('terrain')
    expect(zoneOf('terrain')).toBe('terrain')
    expect(zoneOf('campus')).toBe('campus')
  })

  it('returns null for map parts', () => {
    expect(zoneOf('map/poi:p1')).toBeNull()
    expect(zoneOf('map/road:r-12')).toBeNull()
  })

  it('keeps the encoded building id in the zone key', () => {
    expect(zoneOf(partKey('floor', 'B:1', 'F2'))).toBe('building:B%3A1')
  })
})
