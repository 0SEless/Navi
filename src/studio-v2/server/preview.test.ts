// @vitest-environment node
// Preview before publishing (2026-11-07): the same build as Publish for a saved commit, returned as the campus
// NAVI Web would read — and nothing recorded.
import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import { splitDocument } from '../parts/split'
import type { VerifiedPrincipalResult } from './handlers'
import { publicCampusPayload } from './public-campus-payload'
import { parsePublicCampus } from '@/store/public-store'
import { createPublishHandlers } from './publish-handlers'
import type { StudioRepo } from './studio-repo'
import type { PartRecordWithVersion } from './types'

const editor = { id: 'user-editor', email: 'editor@example.org', role: 'campus_admin', method: 'supabase' }

function partsOf(doc: CampusDocument): PartRecordWithVersion[] {
  return splitDocument(doc).parts.map((part) => ({
    partKey: part.key, versionNo: 1, checksum: '0'.repeat(64), sortKey: part.sortKey,
    content: part.contentBase64 !== undefined ? null : part.content, contentBase64: part.contentBase64 ?? null,
  }))
}

function setup(role: 'owner' | 'editor' | 'viewer' | null = 'editor', doc: CampusDocument = fixtureFull()) {
  const repo = {
    partsAtCommit: vi.fn(async (_campusId: string, commitNo: number) => ({ status: 'ok', commitNo, parts: partsOf(doc) })),
    recordPublication: vi.fn(async () => ({ status: 'ok', publicationNo: 4 })),
    currentPublication: vi.fn(async () => ({ status: 'ok', publication: null })),
    roleOf: vi.fn(async () => role),
  } as unknown as StudioRepo & { recordPublication: ReturnType<typeof vi.fn>; roleOf: ReturnType<typeof vi.fn> }
  const verifyPrincipal = vi.fn(async (): Promise<VerifiedPrincipalResult> => ({ ok: true as const, principal: editor }))
  return { repo, handlers: createPublishHandlers({ repo, verifyPrincipal }) }
}

const post = (path: string, body: unknown) =>
  new Request(`http://localhost/api/studio/v2/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** fixtureFull with its entranceAccess pointing at an indoor route node that does not exist. */
function routeError(): CampusDocument {
  const doc = fixtureFull()
  for (const building of doc.buildings) {
    for (const floor of building.floors) {
      if (floor.entranceAccess) floor.entranceAccess = floor.entranceAccess.map((a) => ({ ...a, indoorRouteNodeId: 'rn-missing' }))
    }
  }
  return doc
}

describe('preview a saved commit', () => {
  it('preview returns the same campus payload NAVI Web would read after publishing that commit', async () => {
    const published = setup('owner')
    await published.handlers.publish(post('publish', { campusId: 'asu-ibajay', commitNo: 7 }))
    const blob = (published.repo.recordPublication.mock.calls[0] as unknown[])[2] as Record<string, unknown>

    const { handlers } = setup('editor')
    const response = await handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { commitNo: number; campus: unknown }
    expect(body.commitNo).toBe(7)
    // The compiler numbers nodes with a running counter and stamps build times, so compare what visitors see.
    const expected = JSON.parse(JSON.stringify(publicCampusPayload('asu-ibajay', blob)))
    const campus = body.campus as typeof expected
    expect(campus.campusName).toBe(expected.campusName)
    expect(campus.source).toBe(expected.source)
    const ids = (list: Array<{ id: string; name?: string }>) => list.map((x) => `${x.id}:${x.name ?? ''}`)
    expect(ids(campus.buildings)).toEqual(ids(expected.buildings))
    expect(ids(campus.components)).toEqual(ids(expected.components))
    expect(campus.nodes).toHaveLength(expected.nodes.length)
    expect(campus.edges).toHaveLength(expected.edges.length)
    expect(Object.keys(campus.artifacts).sort()).toEqual(Object.keys(expected.artifacts).sort())
    expect(campus.artifacts.site).toEqual(expected.artifacts.site)
  })

  it('preview records no publication', async () => {
    const { handlers, repo } = setup('owner')
    await handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('a route error returns ROUTE_INVALID like publish', async () => {
    const { handlers } = setup('editor', routeError())
    const response = await handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as { code: string }).code).toBe('ROUTE_INVALID')
  })

  it('an editor (not owner) may preview; a viewer may not', async () => {
    expect((await setup('editor').handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))).status).toBe(200)
    expect((await setup('viewer').handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))).status).toBe(403)
  })

  it('a stranger gets 404', async () => {
    const response = await setup(null).handlers.preview(post('preview', { campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(404)
  })

  it('a campus with buildings but no routes yet: the preview shows every building, framed on the campus', async () => {
    // The owner's campus (2026-11-08): 29 buildings with empty ground floors, terrain, no roads or routes.
    const doc = fixtureFull()
    doc.roads = []
    for (const building of doc.buildings) {
      building.staircases = []
      building.elevators = []
      building.verticalTransitions = []
      building.verticalConnectors = []
      building.floors = [{ id: `${building.id}-f0`, level: 0, label: 'Ground Floor', height: 3.5, elevation: 0, visible: true, locked: false, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {} }] as unknown as typeof building.floors
    }
    const response = await setup('owner', doc).handlers.preview(post('preview', { campusId: doc.metadata.campusId, commitNo: 7 }))
    expect(response.status).toBe(200)
    const { campus } = (await response.json()) as { campus: { buildings: Array<{ id: string }>; nodes: unknown[] } }
    expect(campus.nodes).toEqual([])
    expect(campus.buildings.map((b) => b.id).sort()).toEqual(doc.buildings.map((b) => b.id).sort())

    const parsed = parsePublicCampus(campus, doc.metadata.campusId)
    expect(parsed).not.toBeNull()
    expect(parsed!.bundle.buildings).toHaveLength(doc.buildings.length)
    // Framed on the buildings, not on 0°, 0°.
    const lat = doc.buildings[0].footprint.points[0].lat
    const box = parsed!.bundle.boundingBox!
    expect(box.minLat).toBeLessThanOrEqual(lat)
    expect(box.maxLat).toBeGreaterThanOrEqual(lat)
    expect(Math.abs(box.minLat)).toBeGreaterThan(1)
  })
})
