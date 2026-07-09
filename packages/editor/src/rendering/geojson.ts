import type { CampusDocument, Building, Road, Panorama, QRCheckpoint, Room, Hallway, Staircase, Elevator, Entrance, LatLng } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'

function latLngToCoords(p: LatLng): [number, number] {
  return [p.lng, p.lat]
}

function localToWorld(local: { x: number; y: number }, buildingId: string, transformer: CoordinateTransformer): [number, number] | null {
  const world = transformer.buildingLocalToWorld(local, buildingId)
  if (!world) return null
  return [world.lng, world.lat]
}

export interface YearnOptions {
  transformer?: CoordinateTransformer
}

function buildingToFeature(b: Building): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: b.id,
    properties: { id: b.id, name: b.name, code: b.code, category: b.category, color: b.color, height: b.height },
    geometry: {
      type: 'Polygon',
      coordinates: [b.footprint.points.map(latLngToCoords)],
    },
  }
}

function floorFeatures(building: Building, transformer?: CoordinateTransformer): GeoJSON.Feature[] {
  if (!transformer) return []
  const features: GeoJSON.Feature[] = []
  for (const floor of building.floors) {
    for (const room of floor.rooms) {
      const coords = room.polygon.points.map(p => localToWorld(p, building.id, transformer)).filter(Boolean) as [number, number][]
      if (coords.length >= 3) {
        features.push({
          type: 'Feature',
          id: room.id,
          properties: { id: room.id, name: room.name, number: room.number, category: room.category, buildingId: building.id, floorId: floor.id, floor: floor.level, entityType: 'room' },
          geometry: { type: 'Polygon', coordinates: [coords] },
        })
      }
    }
    for (const hw of floor.hallways) {
      const coords = hw.polyline.points.map(p => localToWorld(p, building.id, transformer)).filter(Boolean) as [number, number][]
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          id: hw.id,
          properties: { id: hw.id, name: hw.name, width: hw.width, buildingId: building.id, floorId: floor.id, floor: floor.level, entityType: 'hallway' },
          geometry: { type: 'LineString', coordinates: coords },
        })
      }
    }
    for (const st of floor.staircases) {
      const coord = localToWorld(st.position, building.id, transformer)
      if (coord) {
        features.push({
          type: 'Feature',
          id: st.id,
          properties: { id: st.id, name: st.name, fromLevel: st.fromLevel, toLevel: st.toLevel, type: st.type, buildingId: building.id, floorId: floor.id, floor: floor.level, entityType: 'staircase' },
          geometry: { type: 'Point', coordinates: coord },
        })
      }
    }
    for (const el of floor.elevators) {
      const coord = localToWorld(el.position, building.id, transformer)
      if (coord) {
        features.push({
          type: 'Feature',
          id: el.id,
          properties: { id: el.id, name: el.name, fromLevel: el.fromLevel, toLevel: el.toLevel, buildingId: building.id, floorId: floor.id, floor: floor.level, entityType: 'elevator' },
          geometry: { type: 'Point', coordinates: coord },
        })
      }
    }
    for (const ent of floor.entrances) {
      features.push({
        type: 'Feature',
        id: ent.id,
        properties: { id: ent.id, label: ent.label, level: ent.level, type: ent.type, hasQR: ent.hasQR, buildingId: building.id, floorId: floor.id, floor: floor.level, entityType: 'entrance' },
        geometry: { type: 'Point', coordinates: latLngToCoords(ent.position) },
      })
    }
  }
  return features
}

function roadToFeature(r: Road): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: r.id,
    properties: { id: r.id, name: r.name, width: r.width, surface: r.surface, type: r.type, entityType: 'road' },
    geometry: {
      type: 'LineString',
      coordinates: r.polyline.points.map(latLngToCoords),
    },
  }
}

function panoramaToFeature(p: Panorama): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: p.id,
    properties: { id: p.id, label: p.label, heading: p.heading, imageAssetId: p.imageAssetId, buildingId: p.buildingId, floor: p.floor, entityType: 'panorama' },
    geometry: { type: 'Point', coordinates: latLngToCoords(p.position) },
  }
}

function qrToFeature(q: QRCheckpoint): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: q.id,
    properties: { id: q.id, label: q.label, code: q.code, buildingId: q.buildingId, floor: q.floor, entityType: 'qr' },
    geometry: { type: 'Point', coordinates: latLngToCoords(q.position) },
  }
}

export function documentToGeoJSON(doc: CampusDocument, opts?: YearnOptions): Record<string, GeoJSON.FeatureCollection> {
  const transformer = opts?.transformer

  const buildingFeatures = doc.buildings.map(buildingToFeature)

  const roomFeatures: GeoJSON.Feature[] = []
  const hallwayFeatures: GeoJSON.Feature[] = []
  const staircaseFeatures: GeoJSON.Feature[] = []
  const elevatorFeatures: GeoJSON.Feature[] = []
  const entranceFeatures: GeoJSON.Feature[] = []

  if (transformer) {
    for (const bld of doc.buildings) {
      const features = floorFeatures(bld, transformer)
      for (const f of features) {
        const et = f.properties?.entityType
        if (et === 'room') roomFeatures.push(f)
        else if (et === 'hallway') hallwayFeatures.push(f)
        else if (et === 'staircase') staircaseFeatures.push(f)
        else if (et === 'elevator') elevatorFeatures.push(f)
        else if (et === 'entrance') entranceFeatures.push(f)
      }
    }
  }

  return {
    'buildings': { type: 'FeatureCollection', features: buildingFeatures },
    'rooms': { type: 'FeatureCollection', features: roomFeatures },
    'hallways': { type: 'FeatureCollection', features: hallwayFeatures },
    'roads': { type: 'FeatureCollection', features: doc.roads.map(roadToFeature) },
    'panoramas': { type: 'FeatureCollection', features: doc.panoramas.map(panoramaToFeature) },
    'qr': { type: 'FeatureCollection', features: doc.qrCheckpoints.map(qrToFeature) },
    'staircases': { type: 'FeatureCollection', features: staircaseFeatures },
    'elevators': { type: 'FeatureCollection', features: elevatorFeatures },
    'entrances': { type: 'FeatureCollection', features: entranceFeatures },
  }
}

export function toPreviewFeature(geometry: GeoJSON.Geometry, properties?: Record<string, unknown>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: properties || {},
    geometry,
  }
}
