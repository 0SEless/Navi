import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OSM_MAX_ZOOM, osmRasterSource } from '../osm-basemap'

// Owner 2026-11-15: console errors — zoomed past 19 the maps asked OpenStreetMap for zoom 20/21 tiles, which it
// does not serve (blocked by CORS). The street map stops at 19 and MapLibre enlarges those tiles instead.
describe('OpenStreetMap street map', () => {
  it('never asks for tiles past zoom 19', () => {
    expect(OSM_MAX_ZOOM).toBe(19)
    expect(osmRasterSource()).toMatchObject({ type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 })
  })

  it('every map uses it (no OpenStreetMap tile source without the zoom cap)', () => {
    const root = join(__dirname, '..', '..')
    for (const file of ['components/map/CampusMap.tsx', 'components/map/NavigationMap.tsx', 'components/map/PublicMap.tsx', 'components/studio/CreateMapWizard.tsx', 'components/studio/rendering/styles.ts', 'components/floor-editor/OutdoorRoutePicker.tsx']) {
      const text = readFileSync(join(root, file), 'utf8')
      expect(text, file).not.toContain("tiles: ['https://tile.openstreetmap.org")
    }
  })
})
