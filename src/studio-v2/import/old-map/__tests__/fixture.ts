import { toLatLng } from '@navi/core'
import { constantTileBase64, fixtureFull } from '../../../__fixtures__/campus-fixtures'
import type { OldMapExport, TrialTerrainExport } from '../types'

/** The real trial campus grid origin (map-map-5-0y27, checked 2026-11-12). */
export const TRIAL_GRID = { originLat: 11.8170997658108, originLng: 122.16843523135711 }

const at = (x: number, y: number) => toLatLng(TRIAL_GRID, { x, y })

/**
 * Shaped like the old authored document: one building `b-1` with two floors, two roads,
 * one junction, one POI, no boundary or terrain of its own. The campus boundary is a
 * closed ring of 5 points (last repeats first); 3 of the 5 lie inside tile 0_0.
 */
export function oldMapFixture(): OldMapExport {
  const full = fixtureFull() as unknown as Record<string, any>
  const building = { ...full.buildings[0], id: 'b-1' }
  const document: Record<string, unknown> = {
    schemaVersion: full.schemaVersion,
    version: full.version,
    metadata: full.metadata,
    buildings: [building],
    roads: full.roads.slice(0, 2),
    roadJunctions: full.roadJunctions.slice(0, 1),
    pois: full.pois.slice(0, 1),
    panoramas: [],
    qrCheckpoints: [],
  }
  return {
    campusId: 'map-map-1-repe',
    name: 'NAVI – ASU Ibajay Campus',
    schoolName: 'ASU',
    center: at(60, 60),
    boundary: [at(10, 10), at(100, 10), at(200, 100), at(10, 200), at(10, 10)],
    document,
  }
}

export function trialTerrainFixture(): TrialTerrainExport {
  return {
    campusId: 'map-map-5-0y27',
    terrain: {
      terrain: {
        grid: { ...TRIAL_GRID },
        reference: { name: 'Campus ground', zeroMeaning: 'The flat starting ground' },
        colorRange: { minM: 0, maxM: 40 },
      },
    },
    tiles: [{ tileId: '0_0', contentBase64: constantTileBase64(0) }],
  }
}
