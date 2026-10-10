// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as authModule from '../building-cover-auth'

type AuthOptions = {
  env?: Record<string, string | undefined>
  supabaseFactory?: (request: NextRequest) => Promise<{
    auth: { getUser: () => Promise<{ data: { user: unknown }; error: unknown }> }
  }>
}

const auth = authModule as unknown as {
  requireBuildingCoverAdmin(request: NextRequest, campusId: string, options?: AuthOptions): Promise<Response | null>
  getBuildingCoverAdminIdentity(request: NextRequest, campusId: string, options?: AuthOptions): Promise<{ ok: true; userId: string } | { ok: false; response: Response }>
}

const CAMPUS_ID = 'main-campus'
const SESSION_COOKIE = { 'sb-project-auth-token': 'opaque-session' }
const baseEnv = {
  NODE_ENV: 'test',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_MOCK_AUTH: 'false',
  NAVI_ADMIN_EMAILS: '',
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key',
}

function request(cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ')
  return new NextRequest('http://localhost/api/building-cover-upload', {
    method: 'POST',
    headers: cookie ? { cookie } : undefined,
  })
}

function factoryWith(user: unknown, options: { error?: unknown; throwError?: boolean } = {}) {
  return vi.fn(async () => ({
    auth: {
      getUser: async () => {
        if (options.throwError) throw new Error('auth service secret detail')
        return { data: { user }, error: options.error ?? null }
      },
    },
  }))
}

async function responseStatus(response: Response | null): Promise<number | null> {
  return response?.status ?? null
}

describe('building cover verified admin and campus scope', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('requires a Supabase session and verifies it with auth.getUser()', async () => {
    const factory = factoryWith({ id: 'admin-1', app_metadata: { role: 'super_admin' } })
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(), CAMPUS_ID, { env: baseEnv, supabaseFactory: factory }))).toBe(401)
    expect(factory).not.toHaveBeenCalled()
    const allowed = await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, { env: baseEnv, supabaseFactory: factory })
    expect(allowed).toBeNull()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('returns only the verified subject needed to bind upload completion tokens', async () => {
    const factory = factoryWith({ id: 'verified-admin-id', app_metadata: { role: 'super_admin' } })
    await expect(auth.getBuildingCoverAdminIdentity(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv, supabaseFactory: factory,
    })).resolves.toEqual({ ok: true, userId: 'verified-admin-id' })
  })

  it('fails closed on an invalid session, auth service error, or verified non-admin', async () => {
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv,
      supabaseFactory: factoryWith(null, { error: { message: 'invalid session' } }),
    }))).toBe(401)
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv,
      supabaseFactory: factoryWith(null, { throwError: true }),
    }))).toBe(401)
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv,
      supabaseFactory: factoryWith({ id: 'viewer-1', app_metadata: { role: 'viewer' } }),
    }))).toBe(403)
  })

  it('scopes campus_admin to the exact trusted app_metadata campus claim', async () => {
    const matching = { id: 'campus-admin-1', app_metadata: { role: 'campus_admin', campus_id: CAMPUS_ID } }
    expect(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv, supabaseFactory: factoryWith(matching),
    })).toBeNull()
    const mismatched = { id: 'campus-admin-2', app_metadata: { role: 'campus_admin', campus_id: 'other-campus' } }
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv, supabaseFactory: factoryWith(mismatched),
    }))).toBe(403)
    const missing = { id: 'campus-admin-3', app_metadata: { role: 'campus_admin' } }
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv, supabaseFactory: factoryWith(missing),
    }))).toBe(403)
  })

  it('never trusts user_metadata for campus scope; super_admin and explicit allowlist are global', async () => {
    const untrusted = { id: 'campus-admin-4', app_metadata: { role: 'campus_admin' }, user_metadata: { campus_id: CAMPUS_ID } }
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv, supabaseFactory: factoryWith(untrusted),
    }))).toBe(403)
    const superAdmin = { id: 'admin-2', app_metadata: { role: 'super_admin' } }
    expect(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), 'another-campus', {
      env: baseEnv, supabaseFactory: factoryWith(superAdmin),
    })).toBeNull()
    const allowlisted = { id: 'ops-1', email: 'OPS@example.test', app_metadata: { role: 'viewer' } }
    expect(await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), 'another-campus', {
      env: { ...baseEnv, NAVI_ADMIN_EMAILS: 'ops@example.test' }, supabaseFactory: factoryWith(allowlisted),
    })).toBeNull()
  })

  it('allows only explicitly enabled non-production mock campus admins with matching mock campus_id', async () => {
    const mock = Buffer.from(JSON.stringify({ id: 'mock-campus-admin', name: 'Campus Admin', email: 'campus@example.test', role: 'campus_admin', campus_id: CAMPUS_ID })).toString('base64')
    const cookies = { 'navi-mock-session': mock }
    const devEnv = { ...baseEnv, NEXT_PUBLIC_MOCK_AUTH: 'true' }
    expect(await auth.requireBuildingCoverAdmin(request(cookies), CAMPUS_ID, { env: devEnv })).toBeNull()
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(cookies), 'other-campus', { env: devEnv }))).toBe(403)
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(cookies), CAMPUS_ID, {
      env: { ...devEnv, NODE_ENV: 'production', VERCEL_ENV: 'production' },
    }))).toBe(401)
    expect(await responseStatus(await auth.requireBuildingCoverAdmin(request(cookies), CAMPUS_ID, {
      env: { ...baseEnv, NEXT_PUBLIC_MOCK_AUTH: 'false' },
    }))).toBe(401)
  })

  it('returns generic auth failures without exposing service or auth details', async () => {
    const response = await auth.requireBuildingCoverAdmin(request(SESSION_COOKIE), CAMPUS_ID, {
      env: baseEnv,
      supabaseFactory: factoryWith(null, { throwError: true }),
    })
    const body = await response!.text()
    expect(response?.status).toBe(401)
    expect(body).not.toContain('auth service secret detail')
    expect(body).not.toMatch(/service[-_]?role|SUPABASE_SERVICE_ROLE_KEY/i)
  })
})
