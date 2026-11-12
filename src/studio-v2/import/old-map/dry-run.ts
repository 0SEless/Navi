import { decodeTile, tileIdOf, tileOfCell, toLocal, type CampusDocument } from '@navi/core'
import { canonicalJson } from '@/studio-v2/parts/canonical'
import { checkBinaryPart, checkPart, checkSettings, type PartIssue } from '@/studio-v2/parts/content-rules'
import { joinParts } from '@/studio-v2/parts/join'
import { splitDocument, type PartRecord } from '@/studio-v2/parts/split'
import { buildImportDocument } from './build-document'
import type { DryRunReport, OldMapExport, TerrainGridOrigin, TrialTerrainExport } from './types'

type AnyRecord = Record<string, any>

function gridOf(terrainContent: unknown): TerrainGridOrigin | null {
  const grid = (terrainContent as AnyRecord | undefined)?.terrain?.grid
  return grid && typeof grid.originLat === 'number' && typeof grid.originLng === 'number'
    ? { originLat: grid.originLat, originLng: grid.originLng }
    : null
}

/** The document minus the fields a split/join round trip does not keep (version, change journal). */
function comparable(doc: CampusDocument): string {
  const copy = structuredClone(doc) as unknown as AnyRecord
  delete copy.version
  delete copy._changeJournal
  return canonicalJson(copy)
}

/** The new campus settings, copied from the old campus map. */
export function campusSettings(old: OldMapExport): Record<string, unknown> {
  return { campusName: old.name, schoolName: old.schoolName, center: old.center, boundary: old.boundary }
}

function describeIssue(issue: PartIssue): string {
  return `content rule ${issue.code} on ${issue.key}${issue.path ? ` at ${issue.path}` : ''}: ${issue.message}`
}

/** Builds the import document and checks it, writing nothing. */
export function dryRun(
  old: OldMapExport,
  trial: TrialTerrainExport,
  exportHash: string,
): { report: DryRunReport; parts: PartRecord[] } {
  const problems: string[] = []
  const notStored: string[] = []
  const doc = buildImportDocument(old, trial)
  const source = doc as unknown as AnyRecord

  for (const tile of trial.tiles) {
    try {
      decodeTile(tile.contentBase64)
    } catch (error) {
      problems.push(`terrain tile ${tile.tileId}: ${(error as Error).message}`)
    }
  }

  let parts: PartRecord[] = []
  try {
    const split = splitDocument(doc)
    parts = split.parts
    for (const ref of split.localReferences) {
      const fields = (['planImageId', 'planAlignment', 'floorPlanState'] as const).filter((f) => ref[f] !== undefined)
      if (fields.length > 0) notStored.push(`floor ${ref.buildingId}/${ref.floorId}: ${fields.join(', ')}`)
    }
    const joined = joinParts(parts, split.localReferences, {
      lastModified: source.metadata?.lastModified,
      editorVersion: source.metadata?.editorVersion,
    })
    if (comparable(joined) !== comparable(doc)) problems.push('round trip: joining the parts does not give back the built document')
    for (const part of parts) {
      const issues = part.contentBase64 !== undefined
        ? checkBinaryPart(part.key, Buffer.from(part.contentBase64, 'base64').byteLength)
        : checkPart(part)
      problems.push(...issues.map(describeIssue))
    }
  } catch (error) {
    problems.push(`split: ${(error as Error).message}`)
  }

  problems.push(...checkSettings(campusSettings(old)).map(describeIssue))

  const originBefore = gridOf(trial.terrain)
  if (!originBefore) problems.push('trial terrain has no grid origin')
  const terrainPart = parts.find((p) => p.key === 'terrain')
  const originAfter = terrainPart ? gridOf(terrainPart.content) : null
  if (originBefore && canonicalJson(originAfter) !== canonicalJson(originBefore)) {
    problems.push('terrain grid origin changed between the trial campus and the import')
  }

  const tileIds = new Set(trial.tiles.map((t) => t.tileId))
  const boundary = old.boundary
  const outside = originBefore
    ? boundary.filter((point) => {
        const local = toLocal(originBefore, point)
        const { col, row } = tileOfCell(Math.floor(local.x), Math.floor(local.y))
        return !tileIds.has(tileIdOf(col, row))
      }).length
    : boundary.length

  const buildings = (source.buildings ?? []) as AnyRecord[]
  const report: DryRunReport = {
    ok: problems.length === 0,
    problems,
    counts: {
      buildings: buildings.length,
      floors: Object.fromEntries(buildings.map((b) => [b.id, (b.floors ?? []).length])),
      roads: (source.roads ?? []).length,
      junctions: (source.roadJunctions ?? []).length,
      pois: (source.pois ?? []).length,
      terrainTiles: trial.tiles.length,
    },
    originBefore: originBefore ?? { originLat: NaN, originLng: NaN },
    originAfter,
    boundaryOutsideTiles: boundary.length === 0 ? 0 : outside / boundary.length,
    notStored,
    partKeys: parts.map((p) => p.key),
    exportHash,
  }
  return { report, parts }
}

export function renderReport(report: DryRunReport): string {
  const list = (items: string[]) => (items.length === 0 ? '- none' : items.map((i) => `- ${i}`).join('\n'))
  const c = report.counts
  return [
    '# Old map import: dry run',
    '',
    '## Result',
    report.ok ? 'OK: ready to import after owner approval.' : 'STOPPED: fix the problems below first.',
    '',
    '## Counts',
    `- Buildings: ${c.buildings}`,
    ...Object.entries(c.floors).map(([id, n]) => `  - ${id}: ${n} floor(s)`),
    `- Roads: ${c.roads}`,
    `- Road junctions: ${c.junctions}`,
    `- Places (POIs): ${c.pois}`,
    `- Terrain tiles: ${c.terrainTiles}`,
    '',
    '## Terrain origin',
    `- Trial campus: ${report.originBefore.originLat}, ${report.originBefore.originLng}`,
    `- Import: ${report.originAfter ? `${report.originAfter.originLat}, ${report.originAfter.originLng}` : 'missing'}`,
    '',
    '## Boundary',
    `- ${Math.round(report.boundaryOutsideTiles * 100)}% of boundary points fall outside the sculpted tiles (flat ground there).`,
    '',
    '## Not stored by Save v2',
    'Floor-plan image references are local to one browser; Save v2 never stores them.',
    list(report.notStored),
    '',
    '## Problems',
    list(report.problems),
    '',
    `## Parts (${report.partKeys.length})`,
    list(report.partKeys),
    '',
    `Export hash: ${report.exportHash}`,
    '',
  ].join('\n')
}
