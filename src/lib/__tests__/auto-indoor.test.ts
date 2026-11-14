import { describe, expect, it } from 'vitest'
import { autoIndoorDecision, AUTO_INDOOR_ENTER_ZOOM, AUTO_INDOOR_EXIT_ZOOM } from '../auto-indoor'

const square = (id: string, lng: number, lat: number) => ({ id, footprint: [{ lat, lng }, { lat, lng: lng + 0.001 }, { lat: lat + 0.001, lng: lng + 0.001 }, { lat: lat + 0.001, lng }] })
const buildings = [square('cs', 122.17, 11.818), square('lib', 122.18, 11.818)]
const inside = { lng: 122.1705, lat: 11.8185 }
const outside = { lng: 122.175, lat: 11.8185 }

describe('opening a building by zooming in', () => {
  it('opens the building under the map centre once zoomed in close', () => {
    expect(AUTO_INDOOR_ENTER_ZOOM).toBeGreaterThan(AUTO_INDOOR_EXIT_ZOOM)
    expect(autoIndoorDecision({ buildings, center: inside, zoom: AUTO_INDOOR_ENTER_ZOOM, indoor: null })).toEqual({ enter: 'cs' })
  })

  it('does nothing when not close enough or when no building is under the centre', () => {
    expect(autoIndoorDecision({ buildings, center: inside, zoom: AUTO_INDOOR_ENTER_ZOOM - 0.2, indoor: null })).toBeNull()
    expect(autoIndoorDecision({ buildings, center: outside, zoom: 20, indoor: null })).toBeNull()
  })

  it('closes a building it opened when zoomed back out, but not one the visitor tapped', () => {
    expect(autoIndoorDecision({ buildings, center: inside, zoom: AUTO_INDOOR_EXIT_ZOOM - 0.1, indoor: { buildingId: 'cs', auto: true } })).toEqual({ exit: true })
    expect(autoIndoorDecision({ buildings, center: inside, zoom: AUTO_INDOOR_EXIT_ZOOM - 0.1, indoor: { buildingId: 'cs', auto: false } })).toBeNull()
  })

  it('stays open between the two zoom levels (no flicker), and moves to the next building when the centre does', () => {
    expect(autoIndoorDecision({ buildings, center: inside, zoom: (AUTO_INDOOR_ENTER_ZOOM + AUTO_INDOOR_EXIT_ZOOM) / 2, indoor: { buildingId: 'cs', auto: true } })).toBeNull()
    expect(autoIndoorDecision({ buildings, center: { lng: 122.1805, lat: 11.8185 }, zoom: 19.5, indoor: { buildingId: 'cs', auto: true } })).toEqual({ enter: 'lib' })
  })

  it('moves to the building under the centre even after the visitor tapped (or searched into) another one', () => {
    expect(autoIndoorDecision({ buildings, center: { lng: 122.1805, lat: 11.8185 }, zoom: 19.5, indoor: { buildingId: 'cs', auto: false } })).toEqual({ enter: 'lib' })
    // Over open ground, the tapped building stays open.
    expect(autoIndoorDecision({ buildings, center: outside, zoom: 19.5, indoor: { buildingId: 'cs', auto: false } })).toBeNull()
  })
})
