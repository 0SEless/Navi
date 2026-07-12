import type { CampusDocument, Building, Road } from '@navi/core'

export function buildingsToGeoJSON(buildings: Building[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, color: b.color || '#1C6BEB', height: b.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          b.footprint.points
            .map((p) => [p.lng, p.lat] as [number, number])
            .concat([[b.footprint.points[0].lng, b.footprint.points[0].lat]] as [number, number][]),
        ],
      },
    })),
  }
}

export function roadsToTracesGeoJSON(roads: Road[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: roads.map((r) => ({
      type: 'Feature',
      properties: {
        id: r.id,
        name: r.name,
        type: 'road',
        color: '#FFFFFF',
        width: r.width ?? 8,
      },
      geometry: {
        type: 'LineString',
        coordinates: r.polyline.points.map((p) => [p.lng, p.lat] as [number, number]),
      },
    })),
  }
}

export function documentToRenderingGeo(document: CampusDocument): {
  buildingsGeo: GeoJSON.FeatureCollection
  roadsGeo: GeoJSON.FeatureCollection
} {
  return {
    buildingsGeo: buildingsToGeoJSON(document.buildings),
    roadsGeo: roadsToTracesGeoJSON(document.roads),
  }
}
