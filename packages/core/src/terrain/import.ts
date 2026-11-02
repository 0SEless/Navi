import { readGlbGroundMesh } from './glb-ground'
import { utmToLatLng, utmZoneFromCrs } from './utm'
import type { TerrainBaseSource } from './types'

type AnyRecord = Record<string, unknown>
type Position = [number, number]

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function crsNameOf(geojson: AnyRecord): string | null {
  const crs = geojson.crs
  if (!isRecord(crs) || !isRecord(crs.properties)) return null
  return typeof crs.properties.name === 'string' ? crs.properties.name : null
}

/** Converts a GeoJSON position to lat/lng: UTM when the file names a UTM crs, otherwise [lng, lat]. */
function positionReader(geojson: AnyRecord): (p: Position) => { lat: number; lng: number } {
  const crs = crsNameOf(geojson)
  if (crs && !/CRS84|4326/.test(crs)) {
    const { zone, south } = utmZoneFromCrs(crs)
    return ([e, n]) => utmToLatLng(e, n, zone, south)
  }
  return ([lng, lat]) => ({ lat, lng })
}

function features(geojson: unknown): AnyRecord[] {
  if (!isRecord(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection.')
  }
  return geojson.features.filter(isRecord)
}

function lineStrings(geometry: unknown): Position[][] {
  if (!isRecord(geometry)) return []
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) return [geometry.coordinates as Position[]]
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) return geometry.coordinates as Position[][]
  return []
}

/** TopoExport `.glb` ground mesh placed by its frame (the export's frame LineString; its south-west corner is the glb origin). */
export function importTopoExportGlb(glb: Uint8Array, frameGeoJson: unknown): TerrainBaseSource {
  const frame = features(frameGeoJson)
  const ring = frame.flatMap((feature) => lineStrings(feature.geometry)).flat()
  if (ring.length === 0) throw new Error('The frame file has no outline.')
  const minE = Math.min(...ring.map((p) => p[0]))
  const minN = Math.min(...ring.map((p) => p[1]))
  const crs = crsNameOf(frameGeoJson as AnyRecord)
  if (!crs) throw new Error('The frame file does not say which coordinate system it uses.')
  const { zone, south } = utmZoneFromCrs(crs)

  const { positions, indices } = readGlbGroundMesh(glb)
  const vertices: Array<[number, number, number]> = []
  for (let i = 0; i < positions.length; i += 3) {
    const { lat, lng } = utmToLatLng(minE + positions[i], minN + positions[i + 1], zone, south)
    vertices.push([lat, lng, Math.round(positions[i + 2] * 1000) / 1000])
  }
  const triangles: Array<[number, number, number]> = []
  for (let i = 0; i + 2 < indices.length; i += 3) triangles.push([indices[i], indices[i + 1], indices[i + 2]])
  return { kind: 'mesh', vertices, triangles, sourceNote: 'TopoExport 3D ground (EDTM 30 m)' }
}

/** Contour lines: LineString/MultiLineString features with a numeric `properties.elevation`. */
export function importContoursGeoJson(geojson: unknown): TerrainBaseSource {
  const all = features(geojson)
  const read = positionReader(geojson as AnyRecord)
  const lines: Array<{ elevationM: number; points: Array<{ lat: number; lng: number }> }> = []
  for (const feature of all) {
    const elevation = isRecord(feature.properties) ? feature.properties.elevation : undefined
    if (typeof elevation !== 'number' || !Number.isFinite(elevation)) continue
    for (const line of lineStrings(feature.geometry)) {
      if (line.length > 0) lines.push({ elevationM: elevation, points: line.map(read) })
    }
  }
  if (lines.length === 0) throw new Error('No contour lines with an "elevation" value were found.')
  return { kind: 'contours', lines, sourceNote: 'Imported contour lines' }
}
