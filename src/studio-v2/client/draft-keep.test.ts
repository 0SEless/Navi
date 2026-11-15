import { describe, expect, it, vi } from 'vitest'
import { Graph } from '@/engine/graph'
import type { ZoneKey } from '../parts/part-keys'
import type { SaveHttpResult, SaveRequestBody, StatusReply, StudioApi } from './api-client'
import { createMemoryStore } from './kv-store'
import { createDraftStore, type DraftStore, type V2Draft } from './draft-store'
import { createLocalReferenceStore, type LocalReferenceEntry } from './local-reference-store'
import { DRAFT_USER_ID, StudioSession } from './studio-session'
import { ZoneClient } from './zone-client'
import { saveNewCampus } from './new-campus'

// Owner 2026-11-15: answering Cancel to "Restore it?" (or a browser that blocks the question) deleted the unsaved
// work for good. Cancel now keeps it for next time; only an explicit "Delete it for good?" yes discards it.

function api(parts: Array<{ partKey: string; content: unknown; sortKey: string | null }> = []) {
  const status: StatusReply = { headCommit: 1, locks: [], lostZones: [], myRole: 'owner' }
  return {
    load: vi.fn(async () => ({ status: 'ok' as const, headCommit: 1, parts: parts.map((p) => ({ ...p, versionNo: 1, checksum: 'a'.repeat(64), contentBase64: null, deleted: false })) })),
    save: vi.fn(async (body: SaveRequestBody): Promise<SaveHttpResult> => ({ status: 'ok', commitNo: 1, parts: body.changes.map((c) => ({ partKey: c.partKey, versionNo: 1, checksum: 'a'.repeat(64) })), othersChanged: [] })),
    acquire: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ granted: zones, denied: [] })),
    release: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ released: zones })),
    status: vi.fn(async () => status),
  } as unknown as StudioApi
}

const flags = new Set<string>()
const restoreFlag = { take: (id: string) => flags.delete(id), set: (id: string) => { flags.add(id) } }

function session(a: StudioApi, drafts: DraftStore, answers: boolean[]) {
  const confirm = vi.fn((_question: string) => answers.shift() ?? false)
  const s = new StudioSession({
    campusId: 'c1', api: a, zones: new ZoneClient({ campusId: 'c1', api: a }), drafts, restoreFlag,
    references: createLocalReferenceStore(createMemoryStore<LocalReferenceEntry>(), () => 'blob:x'), confirm,
  })
  return { s, confirm }
}

async function savedCampus() {
  const a = api()
  const graph = new Graph()
  graph.campusId = 'c1'
  const footprint = [{ lat: 11.68, lng: 122.36 }, { lat: 11.68, lng: 122.3605 }, { lat: 11.6805, lng: 122.3605 }, { lat: 11.6805, lng: 122.36 }]
  graph.addBuilding({ id: 'b1', name: 'Library', campusId: 'c1', floors: [0], footprint, baseElevation: 0, height: 9, color: '#888', center: { lat: 11.68025, lng: 122.36025 } } as never)
  await saveNewCampus('c1', graph, { session: session(a, createDraftStore(createMemoryStore<V2Draft>()), []).s, ensureCampus: async () => {} })
  const body = vi.mocked(a.save).mock.calls[0][0] as SaveRequestBody
  return body.changes.map((c) => ({ partKey: c.partKey, content: (c as { content: unknown }).content, sortKey: (c as { sortKey?: string | null }).sortKey ?? null }))
}

async function withDraft() {
  const parts = await savedCampus()
  const building = parts.find((p) => p.partKey === 'building:b1')!
  const drafts = createDraftStore(createMemoryStore<V2Draft>())
  await drafts.write({ campusId: 'c1', userId: DRAFT_USER_ID, savedAt: new Date().toISOString(), parts: {
    'building:b1': { baseVersion: 1, content: { ...(building.content as { building: object }), building: { ...(building.content as { building: object }).building, name: 'Renamed library' } }, sortKey: building.sortKey },
  } })
  return { parts, drafts }
}

const name = (doc: unknown) => (doc as { buildings: Array<{ name: string }> }).buildings[0].name

describe('unsaved work on this computer', () => {
  it('Cancel (or a blocked question) keeps it, even after more edits are saved as a draft, and it is offered again', async () => {
    const { parts, drafts } = await withDraft()
    const first = session(api(parts), drafts, [false, false])
    expect(name(await first.s.load())).toBe('Library')
    await first.s.writeDraft() // nothing unsaved now: must not wipe the kept work
    const again = session(api(parts), drafts, [true])
    expect(name(await again.s.load())).toBe('Renamed library')
  })

  it('it is deleted only after a clear yes to "Delete it for good?"', async () => {
    const { parts, drafts } = await withDraft()
    const first = session(api(parts), drafts, [false, true])
    await first.s.load()
    expect(first.confirm.mock.calls[1][0]).toMatch(/Delete it for good\?/)
    const again = session(api(parts), drafts, [true])
    expect(name(await again.s.load())).toBe('Library')
    expect(again.confirm).not.toHaveBeenCalled()
  })
  it('set-aside work is reported, and Restore brings it back on the next open without asking (browsers that block questions)', async () => {
    const { parts, drafts } = await withDraft()
    const first = session(api(parts), drafts, [false, false])
    await first.s.load()
    expect(await first.s.setAsideSince()).toEqual(expect.any(String))
    await first.s.restoreOnNextOpen()
    const again = session(api(parts), drafts, [])
    expect(name(await again.s.load())).toBe('Renamed library')
    expect(again.confirm).not.toHaveBeenCalled()
    expect(await again.s.setAsideSince()).toBeNull()
  })
})
