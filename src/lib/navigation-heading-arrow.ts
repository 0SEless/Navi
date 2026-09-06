import type maplibregl from 'maplibre-gl'
import { normalizeCaptureHeading } from '@/features/capture/direction'

/**
 * Capture's direction arrow remains a small geographic Point rendered by a
 * MapLibre symbol. Navigate's beam helpers live in this module too so the
 * heading normalization stays shared, but they are deliberately separate
 * contracts.
 */
export const NAVIGATION_HEADING_ARROW_IMAGE_WIDTH_PX = 32
export const NAVIGATION_HEADING_ARROW_IMAGE_HEIGHT_PX = 40

export interface NavigationHeadingArrowCoordinate {
  latitude: number
  longitude: number
}

export interface NavigationHeadingArrowProperties {
  kind: 'navigation-forward-heading-arrow'
  heading: number
}

export type NavigationHeadingArrowGeoJson = GeoJSON.FeatureCollection<GeoJSON.Point, NavigationHeadingArrowProperties>

export type NavigationHeadingArrowImage = {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

export type NavigationHeadingBeamBand = 'beam' | 'core'

export interface NavigationHeadingBeamProperties {
  kind: 'navigation-heading-beam'
  heading: number
  band: NavigationHeadingBeamBand
}

export type NavigationHeadingBeamGeoJson = GeoJSON.FeatureCollection<GeoJSON.Polygon, NavigationHeadingBeamProperties>

function emptyNavigationHeadingArrowGeoJson(): NavigationHeadingArrowGeoJson {
  return { type: 'FeatureCollection', features: [] }
}

function emptyNavigationHeadingBeamGeoJson(): NavigationHeadingBeamGeoJson {
  return { type: 'FeatureCollection', features: [] }
}

function isValidCoordinate(position: NavigationHeadingArrowCoordinate | null | undefined): position is NavigationHeadingArrowCoordinate {
  return position !== null
    && position !== undefined
    && Number.isFinite(position.latitude)
    && Number.isFinite(position.longitude)
    && position.latitude >= -90
    && position.latitude <= 90
    && position.longitude >= -180
    && position.longitude <= 180
}

/** Build the protected Capture-compatible geographic point. */
export function buildNavigationHeadingArrowGeoJson(
  position: NavigationHeadingArrowCoordinate | null | undefined,
  heading: number | null | undefined,
): NavigationHeadingArrowGeoJson {
  const normalizedHeading = normalizeCaptureHeading(heading)
  if (!isValidCoordinate(position) || normalizedHeading === null) {
    return emptyNavigationHeadingArrowGeoJson()
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        kind: 'navigation-forward-heading-arrow',
        heading: normalizedHeading,
      },
      geometry: {
        type: 'Point',
        coordinates: [position.longitude, position.latitude],
      },
    }],
  }
}

/** Keep the Capture arrow aligned to geographic north and rotate it from its heading property. */
export function createNavigationHeadingArrowLayer(imageId: string) {
  return {
    type: 'symbol' as const,
    layout: {
      'icon-image': imageId,
      'icon-anchor': 'bottom',
      'icon-size': 0.75,
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  }
}

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [currentX, currentY] = polygon[index]
    const [previousX, previousY] = polygon[previous]
    const intersects = ((currentY > y) !== (previousY > y))
      && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX
    if (intersects) inside = !inside
  }
  return inside
}

/**
 * Create the small green Capture arrow without relying on a DOM canvas. This
 * keeps the MapLibre StyleImageInterface usable in tests and during SSR
 * setup, while retaining the same symbol/image rendering contract.
 */
export function createNavigationHeadingArrowImage(): NavigationHeadingArrowImage {
  const width = NAVIGATION_HEADING_ARROW_IMAGE_WIDTH_PX
  const height = NAVIGATION_HEADING_ARROW_IMAGE_HEIGHT_PX
  const data = new Uint8ClampedArray(width * height * 4)
  const arrow: Array<[number, number]> = [
    [width / 2, 1],
    [width - 2, 29],
    [width / 2 + 4, 25],
    [width / 2, height - 1],
    [width / 2 - 4, 25],
    [2, 29],
  ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, arrow)) continue
      const offset = (y * width + x) * 4
      data[offset] = 16
      data[offset + 1] = 185
      data[offset + 2] = 129
      data[offset + 3] = 235
    }
  }

  return { width, height, data }
}

/** Register Capture's symbol image once per MapLibre map. */
export function ensureNavigationHeadingArrowImage(map: maplibregl.Map, imageId: string): void {
  if (map.hasImage(imageId)) return
  map.addImage(imageId, createNavigationHeadingArrowImage())
}

function buildRoundedBeamPolygon(
  lng: number,
  lat: number,
  heading: number,
  spreadDegrees: number,
  radiusDegrees: number,
  arcSegments: number,
): number[][] {
  const halfSpread = spreadDegrees / 2
  const startAngle = heading - halfSpread
  const angleStep = spreadDegrees / arcSegments
  const coordinates: number[][] = [[lng, lat]]

  // Sampling the front arc gives the fan a rounded cap instead of a sharp
  // triangular tip. The origin remains the location anchor for the beam.
  for (let index = 0; index <= arcSegments; index++) {
    const angle = startAngle + index * angleStep
    const angleRad = (angle * Math.PI) / 180
    coordinates.push([
      lng + radiusDegrees * Math.sin(angleRad),
      lat + radiusDegrees * Math.cos(angleRad),
    ])
  }

  coordinates.push([lng, lat])
  return coordinates
}

/**
 * Build one visual Navigate heading beam from two compact opacity bands. Both
 * bands share the same short rounded fan; neither is an oversized secondary
 * cone, and both consume the already-resolved heading unchanged.
 */
export function buildNavigationHeadingBeamGeoJson(
  position: NavigationHeadingArrowCoordinate | null | undefined,
  heading: number | null | undefined,
): NavigationHeadingBeamGeoJson {
  const normalizedHeading = normalizeCaptureHeading(heading)
  if (!isValidCoordinate(position) || normalizedHeading === null) {
    return emptyNavigationHeadingBeamGeoJson()
  }

  const bands: Array<{ band: NavigationHeadingBeamBand; spread: number; radius: number; segments: number }> = [
    { band: 'beam', spread: 42, radius: 0.00032, segments: 20 },
    { band: 'core', spread: 24, radius: 0.0002, segments: 16 },
  ]

  return {
    type: 'FeatureCollection',
    features: bands.map(({ band, spread, radius, segments }) => ({
      type: 'Feature' as const,
      properties: {
        kind: 'navigation-heading-beam' as const,
        heading: normalizedHeading,
        band,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [buildRoundedBeamPolygon(
          position.longitude,
          position.latitude,
          normalizedHeading,
          spread,
          radius,
          segments,
        )],
      },
    })),
  }
}

export function createNavigationHeadingBeamLayers(sourceId: string) {
  return [
    {
      id: `${sourceId}-beam`,
      type: 'fill' as const,
      source: sourceId,
      filter: ['==', ['get', 'band'], 'beam'] as const,
      paint: {
        'fill-color': '#10b981',
        'fill-opacity': 0.1,
        'fill-antialias': true,
      },
    },
    {
      id: `${sourceId}-core`,
      type: 'fill' as const,
      source: sourceId,
      filter: ['==', ['get', 'band'], 'core'] as const,
      paint: {
        'fill-color': '#10b981',
        'fill-opacity': 0.24,
        'fill-antialias': true,
      },
    },
  ]
}
