import { describe, expect, it, vi } from 'vitest'
import * as scopedRuntime from './scoped-postgres-runtime'

async function loadRuntime() {
  return scopedRuntime as unknown as Record<string, unknown>
}

function validEnvironment() {
  return {
    NODE_ENV: 'development',
    NAVI_STUDIO_DURABLE_SCOPED_SAVE: '1',
    NAVI_E5_PG_HOST: '127.0.0.1',
    NAVI_E5_PG_PORT: '55433',
    NAVI_E5_PG_DATABASE: 'navi_e4_test',
    NAVI_E5_PG_USER: 'navi_e4_runner',
    NAVI_E5_PG_PASSWORD: 'synthetic-only-secret',
  }
}

describe('E5 scoped PostgreSQL runtime guard', () => {
  it('is disabled by default', async () => {
    const runtime = await loadRuntime()
    if (!runtime) return
    expect(() => (runtime.readE5ScopedPostgresConfig as (env: Record<string, string | undefined>) => unknown)({})).toThrow(/disabled/i)
  })

  it('refuses production even when the server flag is set', async () => {
    const runtime = await loadRuntime()
    if (!runtime) return
    expect(() => (runtime.readE5ScopedPostgresConfig as (env: Record<string, string | undefined>) => unknown)({
      ...validEnvironment(), NODE_ENV: 'production',
    })).toThrow(/disabled/i)
  })

  it.each([
    ['host', { NAVI_E5_PG_HOST: 'db.example.test' }],
    ['port', { NAVI_E5_PG_PORT: '5432' }],
    ['database', { NAVI_E5_PG_DATABASE: 'postgres' }],
    ['role', { NAVI_E5_PG_USER: 'postgres' }],
  ])('rejects a non-E5 %s', async (_label, override) => {
    const runtime = await loadRuntime()
    if (!runtime) return
    expect(() => (runtime.readE5ScopedPostgresConfig as (env: Record<string, string | undefined>) => unknown)({
      ...validEnvironment(), ...override,
    })).toThrow(/E5/i)
  })

  it('rejects a missing password without disclosing credential values', async () => {
    const runtime = await loadRuntime()
    if (!runtime) return
    const env = { ...validEnvironment(), NAVI_E5_PG_PASSWORD: '' }
    let message = ''
    try {
      ;(runtime.readE5ScopedPostgresConfig as (env: Record<string, string | undefined>) => unknown)(env)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/password/i)
    expect(message).not.toContain('synthetic-only-secret')
  })

  it('accepts only the E5 local configuration and verifies database identity', async () => {
    const runtime = await loadRuntime()
    if (!runtime) return
    const config = (runtime.readE5ScopedPostgresConfig as (env: Record<string, string | undefined>) => Record<string, unknown>)(validEnvironment())
    expect(config).toMatchObject({ host: '127.0.0.1', port: 55433, database: 'navi_e4_test', user: 'navi_e4_runner' })
    const release = vi.fn()
    const query = vi.fn().mockResolvedValue({ rows: [{
      database: 'navi_e4_test',
      role: 'navi_e4_runner',
      version_num: 170011,
      marker: 'navi-e4-synthetic-v1',
    }] })
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) }
    await (runtime.assertE5ScopedDatabaseIdentity as (pool: unknown) => Promise<void>)(pool)
    expect(query).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects a database whose marker or server major does not match E5', async () => {
    const runtime = await loadRuntime()
    if (!runtime) return
    const release = vi.fn()
    const query = vi.fn().mockResolvedValue({ rows: [{
      database: 'navi_e4_test', role: 'navi_e4_runner', version_num: 160000, marker: 'wrong-marker',
    }] })
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) }
    await expect((runtime.assertE5ScopedDatabaseIdentity as (pool: unknown) => Promise<void>)(pool)).rejects.toMatchObject({ code: 'E5_IDENTITY_MISMATCH' })
    expect(release).toHaveBeenCalledOnce()
  })
})
