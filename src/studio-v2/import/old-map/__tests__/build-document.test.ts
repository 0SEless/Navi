import { describe, expect, it } from 'vitest'
import { CONNECTIVITY_CONTRACT_VERSION } from '@navi/core'
import { buildImportDocument } from '../build-document'
import { oldMapFixture, trialTerrainFixture } from './fixture'

describe('buildImportDocument', () => {
  it('sets the boundary from the old campus map, unchanged (closed ring kept)', () => {
    const old = oldMapFixture()
    const doc = buildImportDocument(old, trialTerrainFixture())
    expect(doc.boundary).toEqual({ points: old.boundary })
    expect(doc.boundary?.points.at(-1)).toEqual(doc.boundary?.points[0])
  })

  it('copies the trial terrain and tiles unchanged', () => {
    const trial = trialTerrainFixture()
    const doc = buildImportDocument(oldMapFixture(), trial) as unknown as Record<string, unknown>
    expect(doc.terrain).toEqual(trial.terrain.terrain)
    expect(doc.terrainTiles).toEqual({ '0_0': trial.tiles[0].contentBase64 })
  })

  it('keeps every old id and takes nothing else from the trial campus', () => {
    const old = oldMapFixture()
    const doc = buildImportDocument(old, trialTerrainFixture())
    expect(doc.buildings.map((b) => b.id)).toEqual((old.document.buildings as Array<{ id: string }>).map((b) => b.id))
    expect(doc.roads).toEqual(old.document.roads)
    expect(doc.roadJunctions).toEqual(old.document.roadJunctions)
    expect(doc.pois).toEqual(old.document.pois)
    expect(Object.keys(doc).sort()).toEqual(
      [...Object.keys(old.document), 'boundary', 'terrain', 'terrainTiles', 'connectivitySemanticsVersion'].sort(),
    )
  })

  it('stamps the Save v2 campus format like the campus wizard, so the editor does not rebuild it (and drop terrain) on open', () => {
    const old = oldMapFixture()
    old.document.schemaVersion = 2
    delete old.document.connectivitySemanticsVersion
    const doc = buildImportDocument(old, trialTerrainFixture())
    expect(doc.connectivitySemanticsVersion).toBe(CONNECTIVITY_CONTRACT_VERSION)
    expect(doc.schemaVersion).toBe(1)
  })

  it('does not mutate its inputs', () => {
    const old = oldMapFixture()
    const trial = trialTerrainFixture()
    const before = structuredClone({ old, trial })
    buildImportDocument(old, trial)
    expect({ old, trial }).toEqual(before)
  })
})
