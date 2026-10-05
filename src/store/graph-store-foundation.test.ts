import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Graph } from '../engine/graph'
import { useGraphStore, __resetGraphSaveQueuesForTests } from './graph-store'
import { fullSnapshotFingerprint } from '../services/full-snapshot-identity'

const campus = 'foundation-campus'
const cache = `navi-graph-${campus}`
const marker = `navi-sync-status-${campus}`
const revision1 = '2026-10-04T01:00:00.000Z'
const revision2 = '2026-10-04T02:00:00.000Z'
function graph() {
  const g = new Graph()
  g.campusId = campus
  g.addBuilding({ id: 'b1', campusId: campus, name: 'Same Graph', footprint: [] } as never)
  return g
}
function document(name: string) {
  return { schemaVersion: 1, version: 0, metadata: { campusId: campus, name, description: '', lastModified: '', editorVersion: '' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] }
}
function payload(name: string, revision = revision1) {
  return { ...graph().toJSON(), authoredDocumentFormatVersion: 1, authoredDocument: document(name), updatedAt: revision }
}
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
async function seed() {
  vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => response(init?.method === 'POST' ? { updatedAt: revision1 } : payload('A'))))
  useGraphStore.setState({ graph: graph(), authoredDocument: document('A'), currentMapId: campus, syncStatus: 'idle', syncError: null, pendingAuthoredMutations: [] })
  useGraphStore.getState().completeCampusHydration()
  await useGraphStore.getState().save()
}
async function reload(server = payload('B', revision2)) {
  vi.stubGlobal('fetch', vi.fn(async () => response(server)))
  useGraphStore.getState().loadMapData(campus)
  await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).not.toBe('checking'))
}
describe('complete revision/content binding', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    __resetGraphSaveQueuesForTests()
    useGraphStore.setState({ graph: new Graph(), authoredDocument: null, currentMapId: null, syncStatus: 'idle', syncError: null, pendingAuthoredMutations: [] })
  })
  it('adopts authored B at R2 even when the Graph is identical to clean authored A at R1', async () => {
    await seed()
    await reload()
    await vi.waitFor(() => expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('B'))
    expect(JSON.parse(localStorage.getItem(marker)!).serverTimestamp).toBe(revision2)
    expect(JSON.parse(localStorage.getItem(cache)!).authoredDocument.metadata.name).toBe('B')
  })
  it('preserves dirty authored C and R1 when server authored B diverges with identical Graph', async () => {
    await seed()
    localStorage.setItem(cache, JSON.stringify(payload('C')))
    await reload()
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('C')
    expect(JSON.parse(localStorage.getItem(marker)!).serverTimestamp).toBe(revision1)
  })
  it('preserves local content when an old Graph-only marker cannot prove authored equality', async () => {
    await seed()
    const old = JSON.parse(localStorage.getItem(marker)!)
    delete old.formatVersion
    localStorage.setItem(marker, JSON.stringify(old))
    await reload()
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('A')
  })
  it('verifies identical complete content and upgrades an old marker after authoritative GET', async () => {
    await seed()
    localStorage.setItem(marker, JSON.stringify({ snapshotFingerprint: 'old-graph-only', serverTimestamp: revision1 }))
    await reload(payload('A', revision2))
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    expect(JSON.parse(localStorage.getItem(marker)!)).toMatchObject({ formatVersion: 2, serverTimestamp: revision2 })
  })
  it('reads a historical NULL companion without inventing authored state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...graph().toJSON(), authoredDocument: null, updatedAt: revision1 })))
    await useGraphStore.getState().fetchFromSupabase(campus)
    expect(useGraphStore.getState().authoredDocument).toBeNull()
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })
  it('loads a Graph-light authored-rich local cache without discarding it for empty Graph counts', async () => {
    const empty = { ...payload('Local'), buildings: [] }
    localStorage.setItem(cache, JSON.stringify(empty))
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...empty, authoredDocument: document('Server'), updatedAt: revision2 })))
    useGraphStore.getState().loadMapData(campus)
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('Local')
  })
})

describe('authoritative save acknowledgment', () => {
  beforeEach(async () => { localStorage.clear(); __resetGraphSaveQueuesForTests(); await seed() })
  function ack(body: Record<string, unknown>, extra = {}) {
    return { campusId: campus, mutationId: body.mutationId, updatedAt: revision2, committedRevision: revision2, committedContentFingerprint: fullSnapshotFingerprint(body), ...extra }
  }
  it.each([
    { committedContentFingerprint: 'wrong' },
    { campusId: 'other-campus' },
    { mutationId: 'other-mutation' },
    { committedContentFingerprint: fullSnapshotFingerprint(payload('B')) },
  ])('rejects mismatched complete content/campus/mutation ACK %j without advancing marker', async mismatch => {
    const old = localStorage.getItem(marker)
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => response(ack(JSON.parse(String(init?.body)), mismatch))))
    await expect(useGraphStore.getState().save()).rejects.toThrow(/acknowledg|confirm/i)
    expect(useGraphStore.getState().syncStatus).toBe('error')
    expect(localStorage.getItem(marker)).toBe(old)
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('A')
  })
  it('certifies a matching server-derived ACK', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => response(ack(JSON.parse(String(init?.body))))))
    await useGraphStore.getState().save()
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(JSON.parse(localStorage.getItem(marker)!).serverTimestamp).toBe(revision2)
  })
  it('rejects timestamp-only readback with identical Graph but different authored content', async () => {
    const old = localStorage.getItem(marker)
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => response(init?.method === 'POST' ? { updatedAt: revision2 } : payload('B', revision2))))
    await expect(useGraphStore.getState().save()).rejects.toThrow(/confirm/i)
    expect(localStorage.getItem(marker)).toBe(old)
  })
  it.each([false, true])('discards late ACK/error after authoritative load (%s)', async fail => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => {
      if (init?.method !== 'POST') return response(payload('B', revision2))
      await gate
      if (fail) return new Response(JSON.stringify({ error: 'The server changed' }), { status: 409 })
      return response(ack(JSON.parse(String(init.body))))
    }))
    const save = useGraphStore.getState().save()
    await useGraphStore.getState().fetchFromSupabase(campus)
    const adoptedMarker = localStorage.getItem(marker)
    release()
    await save.catch(() => {})
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('B')
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(localStorage.getItem(marker)).toBe(adoptedMarker)
  })
  it('keeps newer authored edits unsaved when an earlier logical mutation is acknowledged', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); await gate; return response(ack(body))
    }))
    const save = useGraphStore.getState().save()
    useGraphStore.getState().setAuthoredDocument(document('C'))
    useGraphStore.getState().recordAuthoredMutation('outdoor')
    release(); await save
    expect(useGraphStore.getState().syncStatus).toBe('idle')
    expect(useGraphStore.getState().pendingAuthoredMutations).toHaveLength(1)
  })
  it('rejects force on ordinary store saves and sends explicit recovery with current CAS and current authored work', async () => {
    useGraphStore.getState().setAuthoredDocument(document('C'))
    useGraphStore.getState().recordAuthoredMutation('outdoor')
    const posted: Array<{ url: unknown; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method !== 'POST') return response(payload('B', revision2))
      const body = JSON.parse(String(init.body)); posted.push({ url, body }); return response(ack(body))
    }))
    await expect(useGraphStore.getState().syncToSupabase({ force: true })).rejects.toThrow(/Ordinary/)
    expect(posted).toHaveLength(0)
    await useGraphStore.getState().reSync({ force: true })
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toBe('/api/graph/recovery')
    expect(posted[0].body).toMatchObject({ expectedServerUpdatedAt: revision2, authoredDocument: { metadata: { name: 'C' } } })
    expect(posted[0].body.forceServerOverwrite).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(cache)!).authoredDocument.metadata.name).toBe('C')
  })
})
