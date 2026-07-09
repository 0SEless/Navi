import { describe, it, expect } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { documentToGeoJSON, toPreviewFeature } from './geojson'

function createDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
    buildings: [{
      id: 'bld-1', name: 'Main', code: 'M', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0 }, { lat: 0, lng: 0 }] },
      baseElevation: 0, height: 20, color: '#4A90D9', aliases: [], metadata: {},
      floors: [{
        id: 'flr-1', level: 0, label: 'Ground', elevation: 0,
        rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {},
      }],
    }],
    roads: [{
      id: 'rd-1', name: 'Main Road', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }] },
      width: 6, surface: 'paved', type: 'arterial', metadata: {},
    }],
    panoramas: [{
      id: 'pan-1', label: 'Entrance View', position: { lat: 0, lng: 0 }, heading: 90,
      imageAssetId: 'img-1', hotspots: [],
    }],
    qrCheckpoints: [{
      id: 'qr-1', label: 'QR-1', position: { lat: 0.001, lng: 0.001 }, floor: 0, buildingId: 'bld-1', code: 'navi://test', metadata: {},
    }],
  }
}

describe('documentToGeoJSON', () => {
  it('converts buildings to GeoJSON features', () => {
    const result = documentToGeoJSON(createDoc())
    expect(result.buildings.features).toHaveLength(1)
    const f = result.buildings.features[0]
    expect(f.geometry.type).toBe('Polygon')
    expect(f.id).toBe('bld-1')
    expect(f.properties?.name).toBe('Main')
  })

  it('converts roads to LineString features', () => {
    const result = documentToGeoJSON(createDoc())
    expect(result.roads.features).toHaveLength(1)
    const f = result.roads.features[0]
    expect(f.geometry.type).toBe('LineString')
    expect(f.id).toBe('rd-1')
  })

  it('converts panoramas to Point features', () => {
    const result = documentToGeoJSON(createDoc())
    expect(result.panoramas.features).toHaveLength(1)
    const f = result.panoramas.features[0]
    expect(f.geometry.type).toBe('Point')
    expect(f.id).toBe('pan-1')
  })

  it('converts QR checkpoints to Point features', () => {
    const result = documentToGeoJSON(createDoc())
    expect(result.qr.features).toHaveLength(1)
    const f = result.qr.features[0]
    expect(f.geometry.type).toBe('Point')
    expect(f.properties?.code).toBe('navi://test')
  })

  it('returns empty collections for entities without data', () => {
    const doc = createDoc()
    doc.buildings = []
    doc.roads = []
    doc.panoramas = []
    doc.qrCheckpoints = []
    const result = documentToGeoJSON(doc)
    expect(result.buildings.features).toHaveLength(0)
    expect(result.rooms.features).toHaveLength(0)
    expect(result.hallways.features).toHaveLength(0)
    expect(result.roads.features).toHaveLength(0)
  })
})

describe('toPreviewFeature', () => {
  it('wraps geometry in a Feature', () => {
    const geom: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
    const f = toPreviewFeature(geom)
    expect(f.type).toBe('Feature')
    expect(f.geometry).toEqual(geom)
  })

  it('includes properties', () => {
    const geom: GeoJSON.Point = { type: 'Point', coordinates: [0, 0] }
    const f = toPreviewFeature(geom, { temp: true })
    expect(f.properties?.temp).toBe(true)
  })
})
