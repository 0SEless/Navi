// Task 17: Save v2 wired into Studio behind NEXT_PUBLIC_NAVI_SAVE_V2 (flag off = legacy untouched).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { createEditorContext, registerBuildingTransforms, useEditor, NavigationCompiler } from '@navi/editor'
import type { PersistenceAdapter } from '@navi/editor'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import { joinParts } from '../parts/join'
import { partKey, type ZoneKey } from '../parts/part-keys'
import { splitDocument } from '../parts/split'
import type { LoadOk, PartRecordWithVersion } from '../server/types'
import type { SaveHttpResult, SaveRequestBody, StudioApi, StatusReply } from './api-client'
import { createMemoryStore } from './kv-store'
import { createDraftStore, type V2Draft } from './draft-store'
import { createLocalReferenceStore, type LocalReferenceEntry } from './local-reference-store'
import { ZoneClient } from './zone-client'
import { StudioSession, __resetStudioSessionsForTests, registerStudioSession } from './studio-session'
import { createV2PersistenceAdapter } from './persistence-adapter'
import { buildGraphFromDocument } from './graph-from-document'
import { adoptV2Document } from './adopt-v2-document'
import { mergeRemoteParts } from './remote-merge'

const CHECKSUM = 'a'.repeat(64)

interface PersistenceLike {
  save(trigger: 'manual' | 'autosave'): Promise<void>
}

function loadOf(doc: CampusDocument, headCommit = 3): LoadOk {
  return {
    status: 'ok',
    headCommit,
    parts: splitDocument(doc).parts.map((part) => ({
      partKey: part.key,
      versionNo: 1,
      checksum: CHECKSUM,
      sortKey: part.sortKey,
      content: part.content,
      contentBase64: null,
    })),
  }
}

function joinedOf(load: LoadOk): CampusDocument {
  return joinParts(load.parts.map((part) => ({ key: part.partKey, content: part.content, sortKey: part.sortKey })))
}

function fakeApi(load: LoadOk, overrides: Partial<StudioApi> = {}) {
  const status: StatusReply = { headCommit: load.headCommit, locks: [], lostZones: [], myRole: 'owner' }
  return {
    load: vi.fn(async () => structuredClone(load)),
    changesSince: vi.fn(async () => ({ status: 'ok' as const, headCommit: load.headCommit, parts: [] })),
    save: vi.fn(async (body: SaveRequestBody): Promise<SaveHttpResult> => ({
      status: 'ok',
      commitNo: load.headCommit + 1,
      parts: body.changes.map((change) => ({ partKey: change.partKey, versionNo: change.expectedVersion + 1, checksum: CHECKSUM })),
      othersChanged: [],
    })),
    acquire: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ granted: zones, denied: [] })),
    release: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ released: zones })),
    forceRelease: vi.fn(async () => ({ released: true })),
    status: vi.fn(async () => status),
    publish: vi.fn(async () => ({ publicationNo: 1, commitNo: load.headCommit })),
    ...overrides,
  } as unknown as StudioApi & Record<string, ReturnType<typeof vi.fn>>
}

function sessionFor(doc: CampusDocument, api = fakeApi(loadOf(doc))) {
  const drafts = createDraftStore(createMemoryStore<V2Draft>())
  const references = createLocalReferenceStore(createMemoryStore<LocalReferenceEntry>(), () => 'blob:local-plan')
  const zones = new ZoneClient({ campusId: doc.metadata.campusId, api })
  const session = new StudioSession({ campusId: doc.metadata.campusId, api, zones, drafts, references, confirm: () => false })
  return { session, api, drafts, references, zones }
}

/** A real editor context whose document is the session's loaded document. */
async function editorFor(session: StudioSession) {
  const doc = await session.load()
  const graph = buildGraphFromDocument(doc!)
  const adapter = createV2PersistenceAdapter(session)
  const context = createEditorContext(graph, adapter, new NavigationCompiler({ compile: async () => ({ status: 'success' }) } as never))
  adoptV2Document(context, { authoredDocument: doc })
  session.attach(context)
  return { context, adapter, doc: doc! }
}

function renameFirstRoad(document: CampusDocument, name: string) {
  document.roads[0].name = name
}

beforeEach(() => {
  __resetStudioSessionsForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Studio wiring — flag off', () => {
  it('with flag off, EditorBridge adapter calls useGraphStore.save exactly as before', async () => {
    vi.stubEnv('NEXT_PUBLIC_NAVI_SAVE_V2', '')
    const { useGraphStore } = await import('@/store/graph-store')
    const { Graph } = await import('@/engine/graph')
    const { EditorBridge } = await import('@/components/studio/EditorBridge')
    const graph = new Graph()
    graph.campusId = 'campus-off'
    useGraphStore.setState({ graph, currentMapId: 'campus-off' })
    const save = vi.spyOn(useGraphStore.getState(), 'save').mockResolvedValue(undefined)
    useGraphStore.setState({ save })
    let persistence: PersistenceLike | null = null
    function Probe() {
      persistence = (useEditor().services.get('persistence') as PersistenceLike | undefined) ?? null
      return null
    }
    render(<EditorBridge><Probe /></EditorBridge>)
    await waitFor(() => expect(persistence).not.toBeNull())
    await persistence!.save('autosave')
    expect(save).toHaveBeenCalledWith({ trigger: 'autosave' })
  })
})

describe('Studio wiring — flag on', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_NAVI_SAVE_V2', '1'))

  it('with flag on, autosave writes draft and makes zero fetch calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { session, api, drafts } = sessionFor(fixtureFull())
    const { context, adapter } = await editorFor(session)
    renameFirstRoad(context.document, 'Edited locally')
    await adapter.save('autosave')
    await adapter.save('manual') // a workflow 'manual' save without the explicit Save button is an edit save (R46)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(api.save).not.toHaveBeenCalled()
    const draft = await drafts.read(session.campusId, 'local-browser')
    expect(Object.keys(draft!.parts)).toEqual([partKey('map/road', context.document.roads[0].id)])
  })

  it('manual save calls SaveController.save', async () => {
    const { session, api, drafts } = sessionFor(fixtureFull())
    const { context, adapter } = await editorFor(session)
    const save = vi.spyOn(session.controller, 'save')
    renameFirstRoad(context.document, 'Saved name')
    await adapter.save('autosave')
    session.markExplicitSave()
    await adapter.save('manual')
    expect(save).toHaveBeenCalledTimes(1)
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(session.isDirty()).toBe(false)
    expect(await drafts.read(session.campusId, 'local-browser')).toBeNull()
  })

  it('a failed explicit save rejects with the owner copy so the editor stays dirty', async () => {
    const doc = fixtureFull()
    const api = fakeApi(loadOf(doc), { save: vi.fn(async (): Promise<SaveHttpResult> => ({ status: 'offline', message: 'Network error' })) })
    const { session } = sessionFor(doc, api)
    const { context, adapter } = await editorFor(session)
    renameFirstRoad(context.document, 'Unsent')
    session.markExplicitSave()
    await expect(adapter.save('manual')).rejects.toThrow('Not saved — your work is kept on this computer')
  })

  it('publish while dirty returns "Save first"', async () => {
    const { session, api } = sessionFor(fixtureFull())
    const { context, adapter } = await editorFor(session)
    renameFirstRoad(context.document, 'Not saved yet')
    expect(await adapter.publish({} as never)).toEqual({ success: false, message: 'Save first' })
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('publish when clean publishes the head commit on the server', async () => {
    const { session, api } = sessionFor(fixtureFull())
    const { adapter } = await editorFor(session)
    const result = await adapter.publish({} as never)
    expect(api.publish).toHaveBeenCalledWith(session.campusId, 3)
    expect(result.success).toBe(true)
  })

  it('loadMapData v2 produces context.document deep-equal to joinParts(load) and registers every building/floor transform', async () => {
    const doc = fixtureFull()
    const load = loadOf(doc)
    const { status: _status, ...body } = load
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.startsWith(`/api/studio/v2/campus/${encodeURIComponent(doc.metadata.campusId)}`)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/api/studio/v2/status') {
        return new Response(JSON.stringify({ headCommit: 3, locks: [], lostZones: [], myRole: 'owner' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { useGraphStore } = await import('@/store/graph-store')
    useGraphStore.setState({ currentMapId: null, authoredDocument: null })
    useGraphStore.getState().loadMapData(doc.metadata.campusId)
    await waitFor(() => expect(useGraphStore.getState().currentMapId).toBe(doc.metadata.campusId))

    const expected = joinedOf(load)
    const state = useGraphStore.getState()
    expect(state.authoredDocument).toEqual(expected)
    expect(fetchSpy.mock.calls.some(([url]) => String(url).startsWith('/api/graph'))).toBe(false)

    const context = createEditorContext(state.graph, {} as PersistenceAdapter, new NavigationCompiler({ compile: async () => ({}) } as never))
    expect(adoptV2Document(context, state)).toBe(true)
    expect(context.document).toEqual(expected)
    const reference = new CoordinateTransformer()
    registerBuildingTransforms(reference, expected.buildings, state.graph)
    for (const building of expected.buildings) {
      expect(context.transformer!.getBuildingSystem(building.id)).toEqual(reference.getBuildingSystem(building.id))
      for (const floor of building.floors) {
        expect(context.transformer!.getFloorSystem(building.id, floor.level)).toEqual(reference.getFloorSystem(building.id, floor.level))
      }
    }
  })

  it('floor-plan upload under v2 stores locally and calls no storage API', async () => {
    const createClient = vi.fn()
    vi.doMock('@/lib/supabase-client', () => ({ createClient }))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { storeFloorPlanLocally } = await import('@/services/floor-plan-storage')
    const references = createLocalReferenceStore(createMemoryStore<LocalReferenceEntry>(), () => 'blob:plan-1')
    const file = new File([new Uint8Array([1, 2, 3])], 'plan.png', { type: 'image/png' })
    const url = await storeFloorPlanLocally(file, 'campus-1', 'bld-1', 'floor-1', references, () => 'blob:plan-1')
    expect(url).toBe('blob:plan-1')
    expect((await references.get('campus-1', 'bld-1', 'floor-1'))?.blob).toBeInstanceOf(Blob)
    expect(createClient).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.doUnmock('@/lib/supabase-client')
  })

  it('campus-map-store under v2 lists/creates/deletes via /api/studio/v2/campuses and writes no localStorage', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({
          campuses: [{
            id: 'campus-a', name: 'ASU Ibajay', headCommit: 2, createdAt: '2026-11-01T00:00:00.000Z', publishedAt: null,
            settings: { schoolName: 'ASU', boundary: [], center: { lat: 11.8, lng: 122.2 }, stats: { buildings: 3, nodes: 0, edges: 0 }, updatedAt: '2026-11-01T01:00:00.000Z', landmarkTypes: [], landmarkInstances: [] },
          }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ campusId: 'x' }), { status: init?.method === 'POST' ? 201 : 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { useCampusMapStore, __resetCampusMapSyncForTests } = await import('@/store/campus-map-store')
    __resetCampusMapSyncForTests()
    useCampusMapStore.setState({ maps: [], landmarkTypes: [], landmarkInstances: [] })

    await useCampusMapStore.getState().fetchFromSupabase()
    expect(useCampusMapStore.getState().maps.map((map) => map.id)).toEqual(['campus-a'])
    expect(useCampusMapStore.getState().maps[0].updatedAt).toBe('2026-11-01T01:00:00.000Z')

    const id = useCampusMapStore.getState().createMap({ name: 'New campus', schoolName: 'ASU', boundary: [], center: { lat: 1, lng: 2 }, imageUrl: 'data:image/png;base64,AAAA' })
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    const post = calls.find((call) => call.method === 'POST')!
    expect(post.url).toBe('/api/studio/v2/campuses')
    expect(post.body).toMatchObject({ campusId: id, name: 'New campus', settings: { schoolName: 'ASU' } })
    expect((post.body as { settings: Record<string, unknown> }).settings.imageUrl).toBeUndefined()
    // Only the new campus was written, not every campus on each save.
    expect(calls.filter((call) => call.method === 'PATCH' || call.method === 'POST')).toHaveLength(1)

    useCampusMapStore.getState().deleteMap('campus-a')
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true))
    expect(calls.find((call) => call.method === 'DELETE')!.url).toBe('/api/studio/v2/campuses?campus_id=campus-a')
    expect(calls.some((call) => call.url.startsWith('/api/campus-maps'))).toBe(false)
    expect(setItem.mock.calls.some(([key]) => key === 'navi-campus-maps')).toBe(false)
  })

  it('after a remote merge deletes the road an entrance points to, the validation engine reports an issue for that entrance', async () => {
    const { session } = sessionFor(fixtureFull())
    const { context, doc } = await editorFor(session)
    const entrance = doc.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.entrances)).find((candidate) => candidate.connectorRoadId)!
    const tombstone: PartRecordWithVersion = {
      partKey: partKey('map/road', entrance.connectorRoadId!), versionNo: 2, checksum: CHECKSUM, sortKey: null, content: null, contentBase64: null, deleted: true,
    }
    mergeRemoteParts(context, [tombstone], new Set())
    const engine = context.services.get('validationEngine') as unknown as { validate(doc: CampusDocument, mode: string): { issues: Array<{ message: string; entityId?: string }> } }
    const issues = engine.validate(context.document, 'publish').issues
    expect(issues.some((issue) => issue.message.includes(entrance.label) && issue.message.includes(entrance.connectorRoadId!))).toBe(true)
  })

  it('a head move pulls other admins’ saved parts into the document but never overwrites local edits', async () => {
    const doc = fixtureFull()
    const api = fakeApi(loadOf(doc))
    const { session } = sessionFor(doc, api)
    const { context } = await editorFor(session)
    const [mine, theirs] = context.document.roads
    mine.name = 'My unsaved edit'
    const remote = (road: typeof theirs, name: string): PartRecordWithVersion & { deleted: boolean; commitNo: number; author: string } => ({
      partKey: partKey('map/road', road.id), versionNo: 2, checksum: CHECKSUM, content: { ...road, name },
      sortKey: splitDocument(doc).parts.find((part) => part.key === partKey('map/road', road.id))!.sortKey, contentBase64: null, deleted: false, commitNo: 4, author: 'ana',
    })
    ;(api.changesSince as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', headCommit: 4, parts: [remote(theirs, 'Their name'), remote(mine, 'Their overwrite')] })
    await session.pullRemote()
    expect(context.document.roads.find((road) => road.id === theirs.id)!.name).toBe('Their name')
    expect(context.document.roads.find((road) => road.id === mine.id)!.name).toBe('My unsaved edit')
    expect(session.controller.headCommit).toBe(4)
    expect(session.controller.dirtyParts(context.document)).toEqual([partKey('map/road', mine.id)])
  })

  it('registerStudioSession makes the EditorBridge use the v2 adapter (no graph-store save)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const doc = fixtureFull()
    const { session } = sessionFor(doc)
    const loaded = await session.load()
    registerStudioSession(session)
    const { useGraphStore } = await import('@/store/graph-store')
    const { EditorBridge } = await import('@/components/studio/EditorBridge')
    useGraphStore.setState({ graph: buildGraphFromDocument(loaded!), authoredDocument: loaded, currentMapId: doc.metadata.campusId })
    const save = vi.fn(async () => undefined)
    useGraphStore.setState({ save })
    let persistence: PersistenceLike | null = null
    let document: CampusDocument | null = null
    function Probe() {
      const { services, document: current } = useEditor()
      persistence = (services.get('persistence') as PersistenceLike | undefined) ?? null
      document = current
      return null
    }
    render(<EditorBridge><Probe /></EditorBridge>)
    await waitFor(() => expect(persistence).not.toBeNull())
    expect(document).toEqual(loaded)
    await persistence!.save('autosave')
    expect(save).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
