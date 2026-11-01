import { describe, expect, it, vi } from 'vitest'
import { Graph } from '@/engine/graph'
import type { ZoneKey } from '../parts/part-keys'
import type { SaveHttpResult, SaveRequestBody, StatusReply, StudioApi } from './api-client'
import { createMemoryStore } from './kv-store'
import { createDraftStore, type V2Draft } from './draft-store'
import { createLocalReferenceStore, type LocalReferenceEntry } from './local-reference-store'
import { StudioSession } from './studio-session'
import { ZoneClient } from './zone-client'
import { saveNewCampus } from './new-campus'

function emptyCampusApi() {
  const status: StatusReply = { headCommit: 0, locks: [], lostZones: [], myRole: 'owner' }
  return {
    load: vi.fn(async () => ({ status: 'ok' as const, headCommit: 0, parts: [] })),
    save: vi.fn(async (body: SaveRequestBody): Promise<SaveHttpResult> => ({
      status: 'ok',
      commitNo: 1,
      parts: body.changes.map((change) => ({ partKey: change.partKey, versionNo: 1, checksum: 'a'.repeat(64) })),
      othersChanged: [],
    })),
    acquire: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ granted: zones, denied: [] })),
    release: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ released: zones })),
    status: vi.fn(async () => status),
  } as unknown as StudioApi
}

function sessionFor(campusId: string, api: StudioApi) {
  return new StudioSession({
    campusId,
    api,
    zones: new ZoneClient({ campusId, api }),
    drafts: createDraftStore(createMemoryStore<V2Draft>()),
    references: createLocalReferenceStore(createMemoryStore<LocalReferenceEntry>(), () => 'blob:x'),
    confirm: () => false,
  })
}

function wizardGraph(campusId: string): Graph {
  const graph = new Graph()
  graph.campusId = campusId
  const footprint = [
    { lat: 11.68, lng: 122.36 }, { lat: 11.68, lng: 122.3605 }, { lat: 11.6805, lng: 122.3605 }, { lat: 11.6805, lng: 122.36 },
  ]
  graph.addBuilding({ id: 'osm-1', name: 'Bldg No. 1', campusId, floors: [0], footprint, baseElevation: 0, height: 9, color: '#888', center: { lat: 11.68025, lng: 122.36025 } } as never)
  return graph
}

describe('saveNewCampus (campus wizard under Save v2)', () => {
  it('creates the campus row first, then saves the imported buildings as Save v2 parts and frees the locks', async () => {
    const order: string[] = []
    const api = emptyCampusApi()
    vi.mocked(api.load).mockImplementation(async () => {
      order.push('load')
      return { status: 'ok' as const, headCommit: 0, parts: [] }
    })
    const session = sessionFor('campus-new', api)
    const ensureCampus = vi.fn(async () => {
      order.push('campus')
    })
    await saveNewCampus('campus-new', wizardGraph('campus-new'), { session, ensureCampus })

    expect(order).toEqual(['campus', 'load'])
    expect(api.save).toHaveBeenCalledTimes(1)
    const body = vi.mocked(api.save).mock.calls[0][0] as SaveRequestBody
    const keys = body.changes.map((change) => change.partKey)
    expect(keys).toContain('campus')
    expect(keys).toContain('building:osm-1')
    expect(body.changes.find((change) => change.partKey === 'campus')).toMatchObject({ op: 'put' })
    expect(session.zones.held()).toEqual([])
  })

  it('rejects with the owner copy when the save does not land', async () => {
    const api = emptyCampusApi()
    vi.mocked(api.save).mockResolvedValue({ status: 'offline', message: 'Network error' })
    const session = sessionFor('campus-new', api)
    await expect(saveNewCampus('campus-new', wizardGraph('campus-new'), { session, ensureCampus: async () => {} }))
      .rejects.toThrow('Not saved — your work is kept on this computer')
  })
})
