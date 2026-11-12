import { describe, expect, it } from 'vitest'
import { dryRun, renderReport } from '../dry-run'
import { oldMapFixture, trialTerrainFixture } from './fixture'

describe('dryRun', () => {
  it('passes the fixture with exact counts and an unchanged terrain origin', () => {
    const { report } = dryRun(oldMapFixture(), trialTerrainFixture(), 'h')
    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.counts).toEqual({ buildings: 1, floors: { 'b-1': 2 }, roads: 2, junctions: 1, pois: 1, terrainTiles: 1 })
    expect(report.originAfter).toEqual(report.originBefore)
  })

  it('returns the parts that would be saved, including the terrain tile', () => {
    const { report, parts } = dryRun(oldMapFixture(), trialTerrainFixture(), 'h')
    expect(parts.map((p) => p.key)).toEqual(report.partKeys)
    expect(report.partKeys).toContain('terrain')
    expect(report.partKeys).toContain('terrain-tile:0_0')
    expect(report.partKeys).toContain('building:b-1')
  })

  it('stops on an unknown top-level field and names it', () => {
    const old = oldMapFixture()
    old.document.legacyThing = 1
    const { report } = dryRun(old, trialTerrainFixture(), 'h')
    expect(report.ok).toBe(false)
    expect(report.problems.join('\n')).toContain('legacyThing')
  })

  it('stops on a tile with the wrong byte length and names the tile', () => {
    const trial = trialTerrainFixture()
    trial.tiles[0].contentBase64 = 'AAAA'
    const { report } = dryRun(oldMapFixture(), trial, 'h')
    expect(report.ok).toBe(false)
    expect(report.problems.join('\n')).toContain('0_0')
  })

  it('reports the share of boundary points outside the copied tiles', () => {
    expect(dryRun(oldMapFixture(), trialTerrainFixture(), 'h').report.boundaryOutsideTiles).toBeCloseTo(0.4)
  })

  it('lists local-only floor fields that Save v2 does not store, without blocking', () => {
    const old = oldMapFixture()
    const floor = (old.document.buildings as any[])[0].floors[0]
    floor.planImageId = 'img-1'
    const { report } = dryRun(old, trialTerrainFixture(), 'h')
    expect(report.ok).toBe(true)
    expect(report.notStored.join('\n')).toContain('planImageId')
  })

  it('renders a report with counts, origin, problems and the export hash', () => {
    const text = renderReport(dryRun(oldMapFixture(), trialTerrainFixture(), 'hash-123').report)
    for (const heading of ['## Result', '## Counts', '## Terrain origin', '## Boundary', '## Not stored by Save v2', '## Problems', '## Parts']) {
      expect(text).toContain(heading)
    }
    expect(text).toContain('hash-123')
  })
})
