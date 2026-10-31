import { describe, expect, it } from 'vitest'
import { createScopedHistoryRuntime, handleScopedHistoryRequest } from './scoped-history-dev-route'

function post(body: unknown, host = 'localhost:3000') {
  return new Request('http://localhost:3000/api/dev/scoped-history', {
    method: 'POST',
    headers: { host, origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const enabled = { NODE_ENV: 'development', NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: 'true', NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS: 'true' }

describe('Development scoped-history endpoint', () => {
  it('does not create a session when the opt-in is off', async () => {
    const runtime = createScopedHistoryRuntime()
    const response = await handleScopedHistoryRequest(post({ type: 'initialize' }), { ...enabled, NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: 'false' }, runtime)
    expect(response.status).toBe(404)
    expect(runtime.sessions.size).toBe(0)
  })

  it('accepts only loopback hosts', async () => {
    const response = await handleScopedHistoryRequest(post({ type: 'initialize' }, '192.168.1.20:3000'), enabled, createScopedHistoryRuntime())
    expect(response.status).toBe(403)
  })

  it('commits an explicit multi-scope batch as local-only and returns no cloud acknowledgment', async () => {
    const runtime = createScopedHistoryRuntime()
    const initialized = await handleScopedHistoryRequest(post({
      type: 'initialize', sessionId: 'page-one', campusId: 'campus-1', documentId: 'campus:campus-1',
      baseline: [
        { scope: { kind: 'building', id: 'building-1' }, content: { name: 'Old' } },
        { scope: { kind: 'routing', id: 'campus-1' }, content: { roads: [] } },
      ],
    }), enabled, runtime)
    expect(initialized.status).toBe(200)

    const committed = await handleScopedHistoryRequest(post({
      type: 'commit', sessionId: 'page-one', campusId: 'campus-1', documentId: 'campus:campus-1',
      mutationId: 'page-one:mutation:1', expectedRevision: 0,
      operations: [
        { scope: { kind: 'building', id: 'building-1' }, content: { name: 'New' }, dependencyScopes: [] },
        { scope: { kind: 'routing', id: 'campus-1' }, content: { roads: ['road-1'] }, dependencyScopes: [] },
      ],
    }), enabled, runtime)
    const body = await committed.json()
    expect(committed.status).toBe(200)
    expect(body).toMatchObject({ localOnly: true, outcome: 'committed', localRevision: 1, operationCount: 2 })
    expect(body).not.toHaveProperty('acknowledgment')
    expect(body).not.toHaveProperty('serverRevision')
  })

  it('shares campus state across editor sessions and rejects stale baselines and CAS races', async () => {
    const runtime = createScopedHistoryRuntime()
    const baseline = [
      { scope: { kind: 'building' as const, id: 'building-a' }, content: { name: 'A v0' } },
      { scope: { kind: 'building' as const, id: 'building-b' }, content: { name: 'B v0' } },
    ]
    const initialize = (sessionId: string, entries: typeof baseline) => handleScopedHistoryRequest(post({
      type: 'initialize', sessionId, campusId: 'shared-campus', documentId: 'campus:shared-campus', baseline: entries,
    }), enabled, runtime)

    expect((await initialize('editor-a', baseline)).status).toBe(200)
    const firstCommit = await handleScopedHistoryRequest(post({
      type: 'commit', sessionId: 'editor-a', campusId: 'shared-campus', documentId: 'campus:shared-campus',
      mutationId: 'editor-a:building-a:v1', expectedRevision: 0,
      operations: [{ scope: baseline[0].scope, content: { name: 'A v1' }, dependencyScopes: [] }],
    }), enabled, runtime)
    expect(firstCommit.status).toBe(200)

    const staleAttach = await initialize('editor-stale', baseline)
    expect(staleAttach.status).toBe(409)
    await expect(staleAttach.json()).resolves.toMatchObject({ code: 'STALE_BASELINE', localRevision: 1 })

    const currentBaseline = [
      { ...baseline[0], content: { name: 'A v1' } },
      baseline[1],
    ]
    expect((await initialize('editor-b', currentBaseline)).status).toBe(200)

    const attempts = await Promise.all([
      handleScopedHistoryRequest(post({
        type: 'commit', sessionId: 'editor-a', campusId: 'shared-campus', documentId: 'campus:shared-campus',
        mutationId: 'editor-a:building-a:v2', expectedRevision: 1,
        operations: [{ scope: baseline[0].scope, content: { name: 'A v2' }, dependencyScopes: [] }],
      }), enabled, runtime),
      handleScopedHistoryRequest(post({
        type: 'commit', sessionId: 'editor-b', campusId: 'shared-campus', documentId: 'campus:shared-campus',
        mutationId: 'editor-b:building-b:v1', expectedRevision: 1,
        operations: [{ scope: baseline[1].scope, content: { name: 'B v1' }, dependencyScopes: [] }],
      }), enabled, runtime),
    ])
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409])
    const state = runtime.stores.get('shared-campus')?.reconstructCampus('shared-campus', 2)
    expect(state?.revision).toBe(2)
    expect(state?.scopes['building:building-a']?.content).toMatchObject({ name: expect.stringMatching(/^A v[12]$/) })
    expect(state?.scopes['building:building-b']?.content).toMatchObject({ name: expect.stringMatching(/^B v[01]$/) })
    expect(runtime.sessions.get('editor-a')?.store).toBe(runtime.sessions.get('editor-b')?.store)
  })

  it('rejects a changed payload that reuses a completed mutation id', async () => {
    const runtime = createScopedHistoryRuntime()
    const init = {
      type: 'initialize', sessionId: 'reuse-session', campusId: 'campus-1', documentId: 'campus:campus-1',
      baseline: [{ scope: { kind: 'building', id: 'building-1' }, content: { name: 'Old' } }],
    }
    await handleScopedHistoryRequest(post(init), enabled, runtime)
    const first = {
      type: 'commit', sessionId: 'reuse-session', campusId: 'campus-1', documentId: 'campus:campus-1',
      mutationId: 'reuse-session:mutation:1', expectedRevision: 0,
      operations: [{ scope: { kind: 'building', id: 'building-1' }, content: { name: 'New' }, dependencyScopes: [] }],
    }
    await expect(handleScopedHistoryRequest(post(first), enabled, runtime)).resolves.toMatchObject({ status: 200 })
    const changed = structuredClone(first)
    changed.operations[0].content.name = 'Different payload'

    const response = await handleScopedHistoryRequest(post(changed), enabled, runtime)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'MUTATION_ID_REUSED' })
    expect((await runtime.sessions.get('reuse-session')!.store.readCampusState('campus-1')).revision).toBe(1)
  })

  it('rejects a previous page session after it is absent from memory', async () => {
    const response = await handleScopedHistoryRequest(post({
      type: 'commit', sessionId: 'expired-page', campusId: 'campus-1', documentId: 'campus:campus-1',
      mutationId: 'expired:1', expectedRevision: 0, operations: [],
    }), enabled, createScopedHistoryRuntime())
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('does not treat an in-memory local history as durable across a server restart', async () => {
    const firstRuntime = createScopedHistoryRuntime()
    const identity = { sessionId: 'restart-session', campusId: 'campus-1', documentId: 'campus:campus-1' }
    await handleScopedHistoryRequest(post({
      type: 'initialize', ...identity,
      baseline: [{ scope: { kind: 'building', id: 'building-1' }, content: { name: 'Old' } }],
    }), enabled, firstRuntime)
    const committed = await handleScopedHistoryRequest(post({
      type: 'commit', ...identity, mutationId: 'restart-session:1', expectedRevision: 0,
      operations: [{ scope: { kind: 'building', id: 'building-1' }, content: { name: 'New' }, dependencyScopes: [] }],
    }), enabled, firstRuntime)
    await expect(committed.json()).resolves.toMatchObject({ localOnly: true, outcome: 'committed', localRevision: 1 })

    const restartedRuntime = createScopedHistoryRuntime()
    expect(restartedRuntime.sessions.size).toBe(0)
    const stalePageRequest = await handleScopedHistoryRequest(post({
      type: 'commit', ...identity, mutationId: 'restart-session:2', expectedRevision: 1,
      operations: [{ scope: { kind: 'building', id: 'building-1' }, content: { name: 'After restart' }, dependencyScopes: [] }],
    }), enabled, restartedRuntime)
    expect(stalePageRequest.status).toBe(409)
    await expect(stalePageRequest.json()).resolves.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(restartedRuntime.sessions.size).toBe(0)
  })
})
