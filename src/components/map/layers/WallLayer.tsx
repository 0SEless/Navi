'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import type { WallRenderData, OpeningRenderData } from '@/components/map/NavigationRenderModel'
import { cssVar } from '@/components/map/mapTheme'

// ── Constants ──────────────────────────────────────────────────

const SRC = 'walls'
const LYR = {
  FILL: 'walls-fill',
  OUTLINE: 'walls-outline',
} as const

// ── Props ──────────────────────────────────────────────────────

export interface WallLayerProps {
  map: maplibregl.Map | null
  walls: WallRenderData[]
  openings?: OpeningRenderData[]
  buildingId?: string
  floor?: number
  indoorContext?: { active: boolean; buildingId?: string; floorId?: number }
}

// ── Helpers ────────────────────────────────────────────────────

const METRES_PER_DEGREE = 111320

/**
 * Build a rectangular polygon for a wall segment from start to end.
 */
function wallSegmentPolygon(
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  thickness: number,
): [number, number][] {
  // Work in metres around the wall (thickness is metres), then convert the offset back to degrees.
  const perLat = METRES_PER_DEGREE, perLng = METRES_PER_DEGREE * Math.cos(start.lat * Math.PI / 180)
  const dx = (end.lng - start.lng) * perLng
  const dy = (end.lat - start.lat) * perLat
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0 || !Number.isFinite(len)) return []

  const halfThick = thickness / 2
  const nx = ((-dy / len) * halfThick) / perLng
  const ny = ((dx / len) * halfThick) / perLat

  return [
    [start.lng + nx, start.lat + ny],
    [end.lng + nx, end.lat + ny],
    [end.lng - nx, end.lat - ny],
    [start.lng - nx, start.lat - ny],
  ]
}

/**
 * Convert a wall + its openings into wall-segment polygons.
 * Openings carve gaps in the wall: the wall is split at each opening's
 * offset range, producing separate polygon features for each solid segment.
 *
 * Opening offsets are in meters from wall start; wall coordinates are in
 * lat/lng degrees. We convert offsets to the wall's degree-based coordinate
 * system using the wall's length in both units.
 *
 * When no openings are provided, the full wall rectangle is returned.
 */
function wallToSegmentPolygons(
  wall: WallRenderData,
  wallOpenings: OpeningRenderData[],
): [number, number][][] {
  const { start, end, thickness } = wall

  const dx = end.lng - start.lng
  const dy = end.lat - start.lat
  const wallLenDeg = Math.sqrt(dx * dx + dy * dy)
  if (wallLenDeg < 1e-10) return []

  // Wall length in metres (longitude degrees shrink with latitude)
  const wallLenM = Math.sqrt(
    ((end.lng - start.lng) * METRES_PER_DEGREE * Math.cos(start.lat * Math.PI / 180)) ** 2
    + ((end.lat - start.lat) * METRES_PER_DEGREE) ** 2,
  )

  // Conversion factor: meters → degrees along this wall
  const mToDeg = wallLenDeg / wallLenM

  // Sort openings by offset along the wall
  const sorted = [...wallOpenings].sort((a, b) => a.offset - b.offset)

  const segments: [number, number][][] = []
  let cursor = 0 // cursor in degrees

  for (const opening of sorted) {
    // Convert opening offset from meters to degrees
    const openingStartDeg = opening.offset * mToDeg
    const openingEndDeg = (opening.offset + opening.width) * mToDeg

    // Skip openings that are entirely before cursor or entirely past wall
    if (openingEndDeg <= cursor || openingStartDeg >= wallLenDeg) continue

    // Clamp to valid range
    const segStart = Math.max(cursor, openingStartDeg)
    const segEnd = Math.min(wallLenDeg, openingEndDeg)

    if (segStart > cursor) {
      // Solid wall segment before this opening
      const t0 = cursor / wallLenDeg
      const t1 = segStart / wallLenDeg
      const poly = wallSegmentPolygon(
        { lng: start.lng + dx * t0, lat: start.lat + dy * t0 },
        { lng: start.lng + dx * t1, lat: start.lat + dy * t1 },
        thickness,
      )
      if (poly.length >= 4) segments.push(poly)
    }

    cursor = segEnd
  }

  // Final segment after last opening
  if (cursor < wallLenDeg) {
    const t0 = cursor / wallLenDeg
    const poly = wallSegmentPolygon(
      { lng: start.lng + dx * t0, lat: start.lat + dy * t0 },
      end,
      thickness,
    )
    if (poly.length >= 4) segments.push(poly)
  }

  // If no openings produced segments, return the full wall
  if (segments.length === 0) {
    const full = wallSegmentPolygon(start, end, thickness)
    if (full.length >= 4) segments.push(full)
  }

  return segments
}

/**
 * Build GeoJSON features for walls, splitting at door/window openings.
 * Each solid wall segment becomes a separate Polygon feature.
 * Door spans are left as gaps (no polygon = no extrusion).
 */
export function buildWallGeoJSON(walls: WallRenderData[], openings?: OpeningRenderData[]) {
  // Index openings by wallId for O(1) lookup
  const openingsByWall = new Map<string, OpeningRenderData[]>()
  if (openings) {
    for (const o of openings) {
      const list = openingsByWall.get(o.wallId)
      if (list) {
        list.push(o)
      } else {
        openingsByWall.set(o.wallId, [o])
      }
    }
  }

  return {
    type: 'FeatureCollection' as const,
    features: walls
      .flatMap(wall => {
        const wallOpenings = openingsByWall.get(wall.id) ?? []
        const polygons = wallToSegmentPolygons(wall, wallOpenings)

        return polygons.map((polygon, idx) => ({
          type: 'Feature' as const,
          id: wallOpenings.length > 0 ? `${wall.id}-seg${idx}` : wall.id,
          properties: {
            id: wallOpenings.length > 0 ? `${wall.id}-seg${idx}` : wall.id,
            wallId: wall.id,
            buildingId: wall.buildingId,
            floor: wall.floor,
            thickness: wall.thickness,
            hasOpening: wallOpenings.length > 0,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[...polygon, polygon[0]]],
          },
        }))
      }),
  }
}

// ── Component ──────────────────────────────────────────────────

export function WallLayer({
  map,
  walls,
  openings,
  buildingId,
  floor,
  indoorContext,
}: WallLayerProps) {
  const initializedRef = useRef(false)
  // Bumped when setup completes, so the data effect below runs even if setup happened
  // outside React (a late 'load'/'sourcedata' event while terrain tiles keep the style loading).
  const [readyTick, setReadyTick] = useState(0)
  const markInitialized = () => { if (!initializedRef.current) { initializedRef.current = true; setReadyTick(t => t + 1) } }
  const hasPopulatedRef = useRef(false)

  useEffect(() => {
    if (!map) return
    if (initializedRef.current) return
    if (map.getSource(SRC)) {
      markInitialized()
      return
    }

    const init = () => {
      if (initializedRef.current) return
      if (map.getSource(SRC)) {
        markInitialized()
        return
      }

      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      // Wall fill — subtle architectural representation
      map.addLayer({
        id: LYR.FILL,
        type: 'fill',
        source: SRC,
        paint: {
          'fill-color': cssVar('--navi-wall-fill', '#334155'),
          'fill-opacity': 0.7,
        },
      })

      // Wall outline — clean architectural line
      map.addLayer({
        id: LYR.OUTLINE,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': cssVar('--navi-wall-outline', '#1E293B'),
          'line-width': 0.5,
          'line-opacity': 0.9,
        },
      })

      markInitialized()
    }

    if (map.isStyleLoaded()) {
      init()
    } else {
      map.on('load', init)
      // Also when any source delivers data: 'load' fires once, and other layers' sources (the site's
      // terrain tiles) can keep the style loading while this layer mounts.
      map.on('sourcedata', init)
    }

    return () => {
      try {
        map.off('load', init)
        map.off('sourcedata', init)
        ;[LYR.OUTLINE, LYR.FILL].forEach(l => {
          if (map.getLayer(l)) map.removeLayer(l)
        })
        if (map.getSource(SRC)) map.removeSource(SRC)
      } catch {}
      initializedRef.current = false
      hasPopulatedRef.current = false
    }
  }, [map])

  const setData = useCallback(() => {
    if (!map || !initializedRef.current) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return

    // If indoor context is inactive, hide all walls
    if (!indoorContext?.active) {
      src.setData(buildWallGeoJSON([]))
      hasPopulatedRef.current = true
      map.triggerRepaint()
      return
    }

    let filteredWalls = walls
    let filteredOpenings = openings ?? []

    // Gate by indoor context building and floor
    if (indoorContext.buildingId) {
      filteredWalls = filteredWalls.filter(w => w.buildingId === indoorContext.buildingId)
      filteredOpenings = filteredOpenings.filter(o => o.buildingId === indoorContext.buildingId)
    }
    if (indoorContext.floorId !== undefined) {
      filteredWalls = filteredWalls.filter(w => w.floor === indoorContext.floorId)
      filteredOpenings = filteredOpenings.filter(o => o.floor === indoorContext.floorId)
    }
    // Also apply legacy buildingId/floor props if provided
    if (buildingId) {
      filteredWalls = filteredWalls.filter(w => w.buildingId === buildingId)
      filteredOpenings = filteredOpenings.filter(o => o.buildingId === buildingId)
    }
    if (floor !== undefined) {
      filteredWalls = filteredWalls.filter(w => w.floor === floor)
      filteredOpenings = filteredOpenings.filter(o => o.floor === floor)
    }

    src.setData(buildWallGeoJSON(filteredWalls, filteredOpenings))
    hasPopulatedRef.current = true
    map.triggerRepaint()
  }, [map, walls, openings, buildingId, floor, indoorContext])

  useEffect(() => {
    setData()
  }, [setData, indoorContext])

  // Post-init safety net
  useEffect(() => {
    if (!map || !initializedRef.current || hasPopulatedRef.current) return
    setData()
  }, [map, walls, openings, indoorContext, readyTick])

  return null
}
