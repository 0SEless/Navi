import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { utmToLatLng, utmZoneFromCrs } from '../utm'
import { readGlbGroundMesh } from '../glb-ground'
import { sampleBase } from '../base-surface'
import { importContoursGeoJson, importTopoExportGlb } from '../import'
import { toLatLng } from '../grid'
import type { TerrainBaseSource, TerrainGrid } from '../types'

const fixtures = path.join(__dirname, 'fixtures')
const glb = () => new Uint8Array(readFileSync(path.join(fixtures, 'topoexport-asu-ibajay.glb')))
const json = (name: string) => JSON.parse(readFileSync(path.join(fixtures, name), 'utf8'))

describe('utm', () => {
  it('converts the ASU-Ibajay frame corners', () => {
    const sw = utmToLatLng(409425.04, 1306328.06, 51, false)
    expect(sw.lat).toBeCloseTo(11.815874, 5)
    expect(sw.lng).toBeCloseTo(122.168548, 5)
    const ne = utmToLatLng(409962.36, 1306721.12, 51, false)
    expect(ne.lat).toBeCloseTo(11.819443, 5)
    expect(ne.lng).toBeCloseTo(122.17347, 5)
  })

  it('reads the zone from the crs name', () => {
    expect(utmZoneFromCrs('urn:ogc:def:crs:EPSG::32651')).toEqual({ zone: 51, south: false })
    expect(utmZoneFromCrs('urn:ogc:def:crs:EPSG::32751')).toEqual({ zone: 51, south: true })
    expect(() => utmZoneFromCrs('EPSG:4326')).toThrow()
  })
})

describe('glb ground', () => {
  it('reads the TPX_Ground mesh of the TopoExport file', () => {
    const { positions, indices } = readGlbGroundMesh(glb())
    expect(positions.length / 3).toBe(588)
    expect(indices.length / 3).toBe(1080)
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 2; i < positions.length; i += 3) {
      minZ = Math.min(minZ, positions[i])
      maxZ = Math.max(maxZ, positions[i])
    }
    expect(minZ).toBeCloseTo(1.8, 1)
    expect(maxZ).toBeCloseTo(35.5, 1)
  })

  it('throws when there is no TPX_Ground mesh', () => {
    const header = new Uint8Array(12)
    expect(() => readGlbGroundMesh(header)).toThrow()
    const jsonText = JSON.stringify({ asset: { version: '2.0' }, meshes: [{ name: 'Other', primitives: [] }] })
    const padded = jsonText + ' '.repeat((4 - (jsonText.length % 4)) % 4)
    const bytes = new Uint8Array(20 + padded.length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, bytes.length, true)
    view.setUint32(12, padded.length, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(new TextEncoder().encode(padded), 20)
    expect(() => readGlbGroundMesh(bytes)).toThrow('No TPX_Ground mesh in this file')
  })
})

describe('sampleBase', () => {
  const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
  const at = (x: number, y: number) => toLatLng(grid, { x, y })

  it('interpolates inside a mesh triangle and is null outside', () => {
    const corner = (x: number, y: number, h: number): [number, number, number] => {
      const p = at(x, y)
      return [p.lat, p.lng, h]
    }
    const source: TerrainBaseSource = {
      kind: 'mesh',
      vertices: [corner(0, 0, 0), corner(10, 0, 10), corner(10, 10, 20), corner(0, 10, 10)],
      triangles: [[0, 1, 2], [0, 2, 3]],
      sourceNote: 'test',
    }
    expect(sampleBase(source, grid, 5, 5)).toBeCloseTo(10, 3)
    expect(sampleBase(source, grid, 2, 8)).toBeCloseTo(10, 3)
    expect(sampleBase(source, grid, 20, 20)).toBeNull()
  })

  it('interpolates between the nearest contour lines', () => {
    const source: TerrainBaseSource = {
      kind: 'contours',
      lines: [
        { elevationM: 5, points: [at(-50, 0), at(50, 0)] },
        { elevationM: 10, points: [at(-50, 10), at(50, 10)] },
      ],
      sourceNote: 'test',
    }
    expect(sampleBase(source, grid, 0, 2.5)).toBeCloseTo(6.25, 2)
    expect(sampleBase(source, grid, 0, -30)).toBeCloseTo(5 + 5 * (30 / 70), 2)
  })
})

describe('import', () => {
  it('imports the TopoExport glb inside the frame', () => {
    const source = importTopoExportGlb(glb(), json('topoexport-frame.geojson'))
    expect(source.kind).toBe('mesh')
    if (source.kind !== 'mesh') return
    expect(source.vertices).toHaveLength(588)
    expect(source.triangles).toHaveLength(1080)
    for (const [lat, lng] of source.vertices) {
      expect(lat).toBeGreaterThanOrEqual(11.815874 - 2e-5)
      expect(lat).toBeLessThanOrEqual(11.819443 + 2e-5)
      expect(lng).toBeGreaterThanOrEqual(122.168548 - 2e-5)
      expect(lng).toBeLessThanOrEqual(122.17347 + 2e-5)
    }
  })

  it('imports the contour GeoJSON', () => {
    const source = importContoursGeoJson(json('topoexport-contours-edtm-30m.geojson'))
    expect(source.kind).toBe('contours')
    if (source.kind !== 'contours') return
    expect(source.lines).toHaveLength(9)
    for (const line of source.lines) expect([5, 10, 15, 20, 25, 30, 35]).toContain(line.elevationM)
    expect(source.lines[0].points[0].lat).toBeCloseTo(11.8194, 3)
  })

  it('rejects GeoJSON without elevation lines', () => {
    expect(() => importContoursGeoJson({ type: 'FeatureCollection', features: [] })).toThrow()
  })
})
