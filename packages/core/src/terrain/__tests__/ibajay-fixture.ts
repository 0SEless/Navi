// A copy of the owner's ASU-IBAJAY campus for tests: boundary + 29 building footprints (navi-studio-v2, read-only),
// the TopoExport ground, every building following the ground with a "lower" pad (3 m), as after the owner's import.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CampusDocument } from '../../types/document'
import { gridOriginForBoundary } from '../grid'
import { importTopoExportGlb } from '../import'
import type { CampusTerrain } from '../types'

const FIX = join(__dirname, 'fixtures')
export const ibajayCampus = JSON.parse(readFileSync(join(FIX, 'ibajay-campus.json'), 'utf-8')) as { boundary: Array<{ lat: number; lng: number }>; footprints: number[][][] }
export const ibajayBase = importTopoExportGlb(new Uint8Array(readFileSync(join(FIX, 'topoexport-asu-ibajay.glb'))), JSON.parse(readFileSync(join(FIX, 'topoexport-frame.geojson'), 'utf-8')))
export const ibajayGrid = gridOriginForBoundary(ibajayCampus.boundary)

export function ibajayDoc(opts: { pads?: boolean; terrain?: Partial<CampusTerrain>; tiles?: Record<string, string> } = {}): CampusDocument {
  const pads = opts.pads ?? true
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'ibajay-copy' }, roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: ibajayCampus.boundary },
    terrain: { reference: { name: 'Sea level (imported)', zeroMeaning: 'Mean sea level' }, grid: ibajayGrid, base: ibajayBase, colorRange: { minM: 1.8, maxM: 35.5 }, ...opts.terrain },
    ...(opts.tiles ? { terrainTiles: opts.tiles } : {}),
    buildings: ibajayCampus.footprints.map((ring, i) => ({
      id: `b${i}`, name: `B${i}`, code: '', category: 'academic', description: '', baseElevation: 0, height: 5,
      footprint: { points: [...ring, ring[0]].map(([lat, lng]) => ({ lat, lng })) },
      floors: [{ id: `f${i}`, level: 0, label: 'F1', elevation: 0, height: 5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} }],
      verticalConnectors: [], color: '#000', aliases: [], metadata: {},
      ...(pads ? { ground: { baseMode: 'follow-ground', pad: { mode: 'lower', blendMeters: 3 } } } : {}),
    })),
  } as unknown as CampusDocument
}
