import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { Graph } from '../engine/graph'
import { studioDraftRepository } from '../services/studio-local-drafts'
import { useGraphStore, isStudioLocalDraftModeEnabled } from './graph-store'

function campusDocument(campusId: string): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId, name: 'Test campus', lastModified: '', editorVersion: 'test' },
    buildings: [],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

describe('GraphStore local draft mode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    localStorage.clear()
    useGraphStore.setState({
      graph: new Graph(),
      authoredDocument: null,
      currentMapId: null,
      syncStatus: 'idle',
      syncError: null,
      localDraftStatus: 'idle',
      localDraftError: null,
      localDraftRecoveryStatus: 'idle',
      localDraftGeneration: 0,
      pendingAuthoredMutations: [],
    })
  })

  it('requires both development mode and an exact opt-in flag', () => {
    expect(isStudioLocalDraftModeEnabled({ nodeEnv: 'development', flag: 'true' })).toBe(true)
    expect(isStudioLocalDraftModeEnabled({ nodeEnv: 'production', flag: 'true' })).toBe(false)
    expect(isStudioLocalDraftModeEnabled({ nodeEnv: 'development', flag: '1' })).toBe(false)
  })

  it('autosaves a complete local draft without localStorage writes or cloud requests', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'draft-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId, campusReady: true })
    const get = vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(null)
    const put = vi.spyOn(studioDraftRepository, 'put').mockResolvedValue()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGraphStore.getState().save({ trigger: 'autosave' })

    expect(get).toHaveBeenCalledWith(mapId)
    expect(put).toHaveBeenCalledOnce()
    expect(put.mock.calls[0][0]).toMatchObject({ campusId: mapId, documentId: `campus:${mapId}` })
    expect(localStorage.getItem(`navi-graph-${mapId}`)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useGraphStore.getState().localDraftStatus).toBe('saved')
  })

  it('queues a local draft write for an authored mutation even when workflow autosave is in flight', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    vi.stubGlobal('indexedDB', {})
    const mapId = 'mutation-autosave-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId, campusReady: true })
    vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(null)
    const put = vi.spyOn(studioDraftRepository, 'put').mockResolvedValue()

    useGraphStore.getState().recordAuthoredMutation('building', 'building-1', 0)

    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(put.mock.calls[0][0]).toMatchObject({ campusId: mapId })
    expect(useGraphStore.getState().localDraftStatus).toBe('saved')
  })

  it('does not rewrite an identical draft when only volatile timestamps change', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'no-op-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId })
    let stored: import('../services/studio-local-drafts').StudioDraftRecord | null = null
    vi.spyOn(studioDraftRepository, 'get').mockImplementation(async () => stored)
    const put = vi.spyOn(studioDraftRepository, 'put').mockImplementation(async (record) => { stored = record })

    await useGraphStore.getState().saveLocalDraft()
    await useGraphStore.getState().saveLocalDraft()

    expect(put).toHaveBeenCalledOnce()
  })

  it('restores a verified campus draft without an automatic cloud write', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'recover-campus'
    const graph = new Graph()
    graph.campusId = mapId
    const { createStudioDraftRecord } = await import('../services/studio-local-drafts')
    const record = await createStudioDraftRecord({
      campusId: mapId,
      graph: graph.toJSON(),
      authoredDocument: campusDocument(mapId),
      baseServerRevision: null,
      now: () => '2026-10-27T00:00:00.000Z',
    })
    vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(record)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useGraphStore.setState({ currentMapId: mapId, localDraftRecoveryStatus: 'loading' })

    await useGraphStore.getState().recoverLocalDraft(mapId)

    expect(useGraphStore.getState().localDraftRecoveryStatus).toBe('recovered')
    expect(useGraphStore.getState().localDraftStatus).toBe('recovered')
    expect(useGraphStore.getState().authoredDocument?.metadata.campusId).toBe(mapId)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks editor recovery when the read-only server check fails and no durable draft exists', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'unverified-campus'
    useGraphStore.setState({ currentMapId: mapId, localDraftRecoveryStatus: 'loading' })
    vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(null)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))

    await useGraphStore.getState().recoverLocalDraft(mapId)

    expect(useGraphStore.getState().localDraftRecoveryStatus).toBe('error')
    expect(useGraphStore.getState().syncStatus).toBe('error')
    expect(useGraphStore.getState().localDraftError).toMatch(/HTTP 503/)
  })

  it('keeps edits dirty when an earlier IndexedDB write finishes late', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'late-write-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId })
    vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(null)
    let finishWrite: (() => void) | undefined
    vi.spyOn(studioDraftRepository, 'put').mockImplementation(() => new Promise((resolve) => {
      finishWrite = resolve
    }))

    const saving = useGraphStore.getState().saveLocalDraft()
    await vi.waitFor(() => expect(finishWrite).toBeDefined())
    useGraphStore.getState().recordAuthoredMutation('building', 'building-1', 1)
    finishWrite?.()
    await saving

    expect(useGraphStore.getState().localDraftStatus).toBe('dirty')
  })

  it('serializes campus writes so an older queued draft cannot overwrite a newer edit', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'queued-campus'
    const graph = new Graph()
    graph.campusId = mapId
    const initialDocument = campusDocument(mapId)
    useGraphStore.setState({ graph, authoredDocument: initialDocument, currentMapId: mapId })
    let stored: import('../services/studio-local-drafts').StudioDraftRecord | null = null
    vi.spyOn(studioDraftRepository, 'get').mockImplementation(async () => stored)
    let finishFirstWrite: (() => void) | undefined
    let writeCount = 0
    vi.spyOn(studioDraftRepository, 'put').mockImplementation(async (record) => {
      writeCount += 1
      if (writeCount === 1) {
        await new Promise<void>((resolve) => { finishFirstWrite = resolve })
      }
      stored = structuredClone(record)
    })

    const firstSave = useGraphStore.getState().saveLocalDraft()
    await vi.waitFor(() => expect(finishFirstWrite).toBeDefined())
    const latestDocument = campusDocument(mapId)
    latestDocument.metadata.name = 'Latest campus edit'
    useGraphStore.getState().recordAuthoredMutation('building', 'building-1', 1)
    useGraphStore.getState().setAuthoredDocument(latestDocument)
    const secondSave = useGraphStore.getState().saveLocalDraft()
    finishFirstWrite?.()
    await Promise.all([firstSave, secondSave])

    expect(writeCount).toBe(2)
    expect(stored?.authoredDocument.metadata.name).toBe('Latest campus edit')
    expect(useGraphStore.getState().localDraftStatus).toBe('saved')
  })

  it('does not claim success or send a cloud request when IndexedDB hits quota', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'quota-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId })
    vi.spyOn(studioDraftRepository, 'get').mockResolvedValue(null)
    vi.spyOn(studioDraftRepository, 'put').mockRejectedValue(new Error('QuotaExceededError'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(useGraphStore.getState().save({ trigger: 'autosave' })).rejects.toThrow(/quota/i)

    expect(useGraphStore.getState().localDraftStatus).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(`navi-graph-${mapId}`)).toBeNull()
  })

  it('preserves an edit made during manual Cloud Save and does not label it cloud-saved', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    const mapId = 'cloud-ack-campus'
    const graph = new Graph()
    graph.campusId = mapId
    useGraphStore.setState({ graph, authoredDocument: campusDocument(mapId), currentMapId: mapId, campusReady: true })
    let stored: import('../services/studio-local-drafts').StudioDraftRecord | null = null
    vi.spyOn(studioDraftRepository, 'get').mockImplementation(async () => stored)
    vi.spyOn(studioDraftRepository, 'put').mockImplementation(async (record) => { stored = structuredClone(record) })
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveRequest = resolve })
      }
      return Promise.resolve(new Response(JSON.stringify({ updatedAt: '2026-10-27T00:00:00.000Z' }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    useGraphStore.getState().recordAuthoredMutation('building', 'building-1', 1)

    const save = useGraphStore.getState().save({ trigger: 'manual' })
    await vi.waitFor(() => expect(resolveRequest).toBeDefined())
    const latestDocument = campusDocument(mapId)
    latestDocument.metadata.name = 'Edit after request started'
    useGraphStore.getState().recordAuthoredMutation('building', 'building-1', 1)
    useGraphStore.getState().setAuthoredDocument(latestDocument)
    resolveRequest?.(new Response(JSON.stringify({ success: true, updatedAt: '2026-10-27T00:00:00.000Z' }), { status: 200 }))
    await save

    const submittedBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? '')
    expect(submittedBody).toContain('Test campus')
    expect(submittedBody).not.toContain('Edit after request started')
    expect(stored?.authoredDocument.metadata.name).toBe('Edit after request started')
    expect(useGraphStore.getState().syncStatus).toBe('idle')
  })
})
