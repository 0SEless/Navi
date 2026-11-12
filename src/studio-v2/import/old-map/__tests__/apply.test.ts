// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createStudioHandlers, type VerifiedPrincipalResult } from '@/studio-v2/server/handlers'
import type { StudioRepo } from '@/studio-v2/server/studio-repo'
import { applyImport, ownerActorProblem } from '../apply'
import { dryRun } from '../dry-run'
import { oldMapFixture, trialTerrainFixture } from './fixture'

const CAMPUS = 'map-asu-ibajay-imported'
const MESSAGE = 'Import old ASU Ibajay map (map-map-1-repe) with trial terrain'

/** An in-memory repo: just enough of studio.* for create, zones, save and load. */
function memoryRepo() {
  const campuses = new Set<string>()
  const held = new Map<string, string>()
  const parts = new Map<string, { content: unknown; contentBase64: string | null; sortKey: string | null }>()
  const saveCalls: Array<{ baseCommit: number; changes: Array<{ partKey: string; op: string }> }> = []
  let nextSave: Record<string, unknown> | null = null
  const repo = {
    async createCampus(id: string) {
      if (campuses.has(id)) return { status: 'exists' as const }
      campuses.add(id)
      return { status: 'ok' as const, campusId: id }
    },
    async acquireZones(_c: string, _a: string, _n: string, session: string, zones: string[]) {
      for (const z of zones) held.set(z, session)
      return { status: 'ok' as const, granted: zones, denied: [] }
    },
    async releaseZones(_c: string, _a: string, _s: string, zones: string[]) {
      for (const z of zones) held.delete(z)
      return { status: 'ok' as const, released: zones }
    },
    async save(input: { baseCommit: number; changes: Array<{ partKey: string; op: string; content?: unknown; contentBase64?: string; sortKey?: string | null }> }) {
      saveCalls.push(input)
      if (nextSave) {
        const result = nextSave
        nextSave = null
        return result
      }
      for (const c of input.changes) {
        parts.set(c.partKey, { content: c.content ?? null, contentBase64: c.contentBase64 ?? null, sortKey: c.sortKey ?? null })
      }
      return { status: 'ok' as const, commitNo: 1, parts: input.changes.map((c) => ({ partKey: c.partKey, versionNo: 1 })), othersChanged: [] }
    },
    async load() {
      return {
        status: 'ok' as const,
        headCommit: parts.size ? 1 : 0,
        parts: [...parts].map(([partKey, p]) => ({ partKey, versionNo: 1, checksum: 'x', ...p })),
      }
    },
  }
  return {
    repo: repo as unknown as StudioRepo,
    saveCalls,
    seedCampus: (id: string) => campuses.add(id),
    failNextSave: (result: Record<string, unknown>) => { nextSave = result },
    heldZones: () => [...held.keys()],
  }
}

function setup() {
  const memory = memoryRepo()
  const verifyPrincipal = async (): Promise<VerifiedPrincipalResult> => ({
    ok: true,
    principal: { id: 'owner-1', email: null, role: 'super_admin', method: 'script' },
  })
  const handlers = createStudioHandlers({ repo: memory.repo, verifyPrincipal })
  const { parts } = dryRun(oldMapFixture(), trialTerrainFixture(), 'h')
  const input = { handlers, campusId: CAMPUS, name: 'ASU Ibajay (imported)', settings: { campusName: 'NAVI – ASU Ibajay Campus' }, parts, message: MESSAGE }
  return { memory, parts, input }
}

describe('ownerActorProblem', () => {
  const members = [{ user_id: 'owner-1', role: 'owner' }, { user_id: 'editor-2', role: 'editor' }]
  it('accepts an id that owns the trial campus', () => {
    expect(ownerActorProblem('owner-1', members)).toBeNull()
  })
  it('rejects a mistyped or non-owner id, naming it', () => {
    expect(ownerActorProblem('owner-l', members)).toContain('owner-l')
    expect(ownerActorProblem('editor-2', members)).toContain('editor-2')
  })
})

describe('applyImport', () => {
  it('creates the campus, saves all parts in one save, releases zones, and reads back the same keys', async () => {
    const { memory, parts, input } = setup()
    const result = await applyImport(input)
    expect(result).toEqual({ ok: true, commit: 1, savedParts: parts.length })
    expect(memory.saveCalls).toHaveLength(1)
    expect(memory.saveCalls[0].baseCommit).toBe(0)
    expect(memory.heldZones()).toEqual([])
  })

  it('stops at CAMPUS_EXISTS and calls nothing else', async () => {
    const { memory, input } = setup()
    memory.seedCampus(CAMPUS)
    const result = await applyImport(input)
    expect(result).toMatchObject({ ok: false, stage: 'create', status: 409, createdEmptyCampus: false })
    expect(memory.saveCalls).toHaveLength(0)
  })

  it('reports the empty campus and still releases zones when save fails', async () => {
    const { memory, input } = setup()
    memory.failNextSave({ status: 'stale', parts: [] })
    const result = await applyImport(input)
    expect(result).toMatchObject({ ok: false, stage: 'save', status: 409, createdEmptyCampus: true })
    expect(memory.heldZones()).toEqual([])
  })

  it('sends terrain tiles as put-bin and everything else as put', async () => {
    const { memory, input } = setup()
    await applyImport(input)
    for (const change of memory.saveCalls[0].changes) {
      expect(change.op).toBe(change.partKey.startsWith('terrain-tile:') ? 'put-bin' : 'put')
    }
  })
})
