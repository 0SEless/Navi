// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { POST } from '../route'
import { POST as RECOVER } from '../recovery/route'
import { fullSnapshotFingerprint } from '@/services/full-snapshot-identity'
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
const create = vi.mocked(createServerClient)
const doc = { metadata: { campusId: 'foundation-campus', name: 'Authored' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] }
const graph = { campusId: 'foundation-campus', buildings: [], nodes: [], edges: [], components: [] }
let rpc: ReturnType<typeof vi.fn>
let head: Record<string, unknown> | null
let committed: Record<string, unknown> | null
let verifiedUser: { id: string; app_metadata: { role: string } }
function client() {
  return { rpc, auth: { getUser: async () => ({ data: { user: verifiedUser }, error: null }) }, from: vi.fn((table: string) => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: table === 'campus_graph_revisions' ? committed : head, error: null })) }
    return query
  }) }
}
function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/graph', { method: 'POST', headers: { cookie: 'sb-test-auth-token=test' }, body: JSON.stringify(body) })
}
describe('graph persistence foundation API', () => {
  beforeEach(() => {
    head = { data: graph, authored_document: doc, updated_at: '2026-10-04T01:00:00Z' }
    committed = { graph_data: graph, authored_document: doc, revision: '2026-10-04T02:00:00Z' }
    verifiedUser = { id: 'verified-admin', app_metadata: { role: 'super_admin' } }
    rpc = vi.fn(async () => ({ data: { success: true, campus_id: graph.campusId, updatedAt: '2026-10-04T02:00:00Z' }, error: null }))
    create.mockReturnValue(client() as never)
  })
  afterEach(() => vi.unstubAllEnvs())
  it('derives the ACK from immutable committed content, ignoring a client fingerprint and newer head', async () => {
    head = { data: graph, authored_document: { ...doc, metadata: { ...doc.metadata, name: 'Newer head' } }, updated_at: '2026-10-04T03:00:00Z' }
    const body = { ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: '2026-10-04T01:00:00Z', committedContentFingerprint: 'client-lie' }
    const res = await POST(request(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ campusId: graph.campusId, mutationId: 'm1', committedRevision: committed!.revision, committedContentFingerprint: fullSnapshotFingerprint({ ...graph, authoredDocument: doc }) })
  })
  it('fails closed when a successful RPC has no immutable committed content to prove its ACK', async () => {
    committed = null
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: '2026-10-04T01:00:00Z' }))
    expect(res.status).toBe(503)
  })
  it('returns the original committed content/revision on idempotent replay', async () => {
    rpc.mockResolvedValueOnce({ data: { success: true, campus_id: graph.campusId, updatedAt: committed!.revision, idempotent_replay: true }, error: null })
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: '2026-10-04T01:00:00Z' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ idempotent_replay: true, mutationId: 'm1', committedRevision: committed!.revision })
  })
  it('rejects omitted expected revision before the RPC', async () => {
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1' }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects explicit NULL base for an existing Graph-light authored-rich row', async () => {
    // Existence/CAS is decided under the SQL advisory and row locks, after the
    // idempotent replay check. An API pre-read cannot safely decide this case.
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'GRAPH_SNAPSHOT_CONFLICT: existing row requires a matching revision' } })
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: null }))
    expect(res.status).toBe(409)
    expect(rpc).toHaveBeenCalledWith('sync_graph_snapshot_idempotent_v2', expect.anything())
  })
  it('rejects a force flag on the ordinary endpoint', async () => {
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: head!.updated_at, forceServerOverwrite: true, recoveryPurpose: 'body cannot select recovery' }))
    expect(res.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('accepts explicit NULL for an initial create with no server row', async () => {
    head = null
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: null }))
    expect(res.status).toBe(200)
  })
  it('never falls back to an unsafe RPC when protocol v2 is unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } })
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: head!.updated_at }))
    expect(res.status).toBe(503)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('uses verified actor and a distinct recovery RPC with purpose and current CAS', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await RECOVER(request({ ...graph, authoredDocument: doc, mutationId: 'recover', expectedServerUpdatedAt: head!.updated_at, recoveryPurpose: 'Preserve local authored work', createdBy: 'spoofed-actor' }))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('recover_graph_snapshot_idempotent_v2', { payload: expect.objectContaining({ createdBy: 'verified-admin', revisionSource: 'admin-recovery', recoveryPurpose: 'Preserve local authored work', expectedServerUpdatedAt: head!.updated_at }) })
  })
  it('denies recovery to a verified non-admin before any write', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    verifiedUser = { id: 'viewer', app_metadata: { role: 'viewer' } }
    const res = await RECOVER(request({ ...graph, authoredDocument: doc, mutationId: 'recover', expectedServerUpdatedAt: head!.updated_at, recoveryPurpose: 'Client role is not authority', role: 'super_admin' }))
    expect(res.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not let ordinary body metadata select recovery or spoof the verified actor', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await POST(request({ ...graph, authoredDocument: doc, mutationId: 'm1', expectedServerUpdatedAt: head!.updated_at, revisionSource: 'admin-recovery', recoveryPurpose: 'pretend recovery', createdBy: 'spoof' }))
    expect(res.status).toBe(200)
    const call = rpc.mock.calls[0]
    expect(call[0]).toBe('sync_graph_snapshot_idempotent_v2')
    expect(call[1].payload).toMatchObject({ createdBy: 'verified-admin', revisionSource: 'autosave' })
    expect(call[1].payload.recoveryPurpose).toBeUndefined()
  })
  it.each([undefined, null])('rejects a legacy Graph-only writer clearing a modern companion (%s)', async authoredDocument => {
    const res = await POST(request({ ...graph, expectedServerUpdatedAt: head!.updated_at, mutationId: 'm1', authoredDocument }))
    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })
})
