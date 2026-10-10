import { describe, expect, it, vi } from 'vitest'
import * as repositoryModule from '../building-cover-repository'

type RepositoryResult = { ok: true } | { ok: false; reason: 'not_found' | 'unavailable' }
type RepositoryOptions = {
  env?: Record<string, string | undefined>
  createClient?: (url: string, key: string) => unknown
}
const repository = repositoryModule as unknown as {
  checkAuthoredBuildingOwnership(campusId: string, buildingId: string, options?: RepositoryOptions): Promise<RepositoryResult>
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-value',
}

function documentFor(campusId: string, buildingIds: string[]) {
  return {
    metadata: { campusId },
    buildings: buildingIds.map((id) => ({ id, metadata: {} })),
  }
}

function clientFor(result: { data?: unknown; error?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const createClient = vi.fn(() => ({ from }))
  return { createClient, from, select, eq, maybeSingle }
}

describe('read-only authored Building ownership check', () => {
  it('reads only the requested campus authored_document and confirms selected Building membership', async () => {
    const db = clientFor({ data: { authored_document: documentFor('main-campus', ['library', 'gym']) }, error: null })
    await expect(repository.checkAuthoredBuildingOwnership('main-campus', 'library', { env, createClient: db.createClient })).resolves.toEqual({ ok: true })
    expect(db.createClient).toHaveBeenCalledWith(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    expect(db.from).toHaveBeenCalledWith('graph_snapshots')
    expect(db.select).toHaveBeenCalledWith('authored_document')
    expect(db.eq).toHaveBeenCalledWith('campus_id', 'main-campus')
    expect(db.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched authored campus, missing Building, or missing campus row', async () => {
    const mismatched = clientFor({ data: { authored_document: documentFor('other-campus', ['library']) }, error: null })
    await expect(repository.checkAuthoredBuildingOwnership('main-campus', 'library', { env, createClient: mismatched.createClient })).resolves.toEqual({ ok: false, reason: 'not_found' })
    const absentBuilding = clientFor({ data: { authored_document: documentFor('main-campus', ['gym']) }, error: null })
    await expect(repository.checkAuthoredBuildingOwnership('main-campus', 'library', { env, createClient: absentBuilding.createClient })).resolves.toEqual({ ok: false, reason: 'not_found' })
    const absentRow = clientFor({ data: null, error: null })
    await expect(repository.checkAuthoredBuildingOwnership('main-campus', 'library', { env, createClient: absentRow.createClient })).resolves.toEqual({ ok: false, reason: 'not_found' })
  })

  it('fails closed on missing service configuration or database failures without leaking details', async () => {
    const neverCreate = vi.fn()
    await expect(repository.checkAuthoredBuildingOwnership('main-campus', 'library', {
      env: { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL }, createClient: neverCreate,
    })).resolves.toEqual({ ok: false, reason: 'unavailable' })
    expect(neverCreate).not.toHaveBeenCalled()
    const db = clientFor({ data: null, error: { message: 'private query detail' } })
    const result = await repository.checkAuthoredBuildingOwnership('main-campus', 'library', { env, createClient: db.createClient })
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain('private query detail')
    expect(db.from).toHaveBeenCalledTimes(1)
  })
})
