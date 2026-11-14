import { describe, expect, it } from 'vitest'
import { visitorPois } from '../visitor-pois'

const outdoor = { id: 'bench', label: 'BENCH AREA', category: 'waiting_area', position: { lat: 11, lng: 122 } }
const hidden = { id: 'tambayan', label: 'TAMBAYAN', category: 'waiting_area', position: { lat: 11, lng: 122 }, visibility: { showOnMap: false, searchable: true } }
const indoorGf = { id: 'desk', label: 'Help desk', buildingId: 'cs', floor: 0, position: { lat: 11, lng: 122 } }
const indoor1f = { id: 'lab', label: 'Lab sign', buildingId: 'cs', floor: 1, position: { lat: 11, lng: 122 } }
const pois = [outdoor, hidden, indoorGf, indoor1f]

describe('visitorPois', () => {
  it('shows outdoor POIs on the campus map, and none from inside buildings', () => {
    const shown = visitorPois(pois, { active: false }, 0)
    expect(shown.map(p => p.id)).toEqual(['bench', 'tambayan'])
    expect(shown[0]).toMatchObject({ name: 'BENCH AREA', category: 'waiting_area', position: { lat: 11, lng: 122 } })
  })

  it('keeps a hidden POI marked hidden (off the map, still searchable and revealable)', () => {
    expect(visitorPois(pois, { active: false }, 0).find(p => p.id === 'tambayan')!.showOnMap).toBe(false)
  })

  it('adds the open building\'s POIs on the floor shown', () => {
    expect(visitorPois(pois, { active: true, buildingId: 'cs' }, 1).map(p => p.id)).toEqual(['bench', 'tambayan', 'lab'])
  })

  it('names a POI without a label by its category', () => {
    expect(visitorPois([{ id: 'x', label: '', category: 'waiting_area', position: { lat: 1, lng: 2 } }], { active: false }, 0)[0].name).toBe('Waiting area')
  })
})

describe('POI shapes', () => {
  const at = { lat: 11.818, lng: 122.17 }
  it('keeps a rectangle or polygon as its ring, with its look', () => {
    const rect = { id: 'r', label: 'Court', position: at, appearance: { mode: '2.5d', color: '#0EA5E9', height: 2.5 }, geometry: { type: 'rectangle', points: [at, { lat: 11.818, lng: 122.1701 }, { lat: 11.8181, lng: 122.1701 }, { lat: 11.8181, lng: 122.17 }] } }
    const [poi] = visitorPois([rect], { active: false }, 0)
    expect(poi.shape).toHaveLength(4)
    expect(poi.appearance).toEqual({ mode: '2.5d', color: '#0EA5E9', height: 2.5 })
  })

  it('turns a circle (radius in metres) into a round ring of that size', () => {
    const circle = { id: 'c', label: 'Bench', position: at, appearance: { mode: '2d' }, geometry: { type: 'circle', center: at, radius: 3 } }
    const [poi] = visitorPois([circle], { active: false }, 0)
    expect(poi.shape!.length).toBeGreaterThanOrEqual(24)
    const north = Math.max(...poi.shape!.map((p) => p.lat))
    expect((north - at.lat) * 110540).toBeCloseTo(3, 1)
  })

  it('a point POI or a marker look has no shape (it keeps its marker)', () => {
    const point = { id: 'p', label: 'Gate', position: at, geometry: { type: 'point', position: at } }
    const marker = { id: 'm', label: 'Sign', position: at, appearance: { mode: 'marker' }, geometry: { type: 'circle', center: at, radius: 3 } }
    expect(visitorPois([point, marker], { active: false }, 0).map((p) => p.shape)).toEqual([undefined, undefined])
  })
})
