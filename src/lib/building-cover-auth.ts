import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminIdentity } from './admin-authz'
import { decodeMockSession, MOCK_COOKIE } from './mock-auth'

interface VerifiedUser {
  id?: string
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

interface AuthClient {
  auth: {
    getUser: () => Promise<{
      data?: { user?: VerifiedUser | null } | null
      error?: unknown
    }>
  }
}

export interface BuildingCoverAuthOptions {
  env?: Record<string, string | undefined>
  /** Test seam for an auth client whose getUser result models Supabase verification. */
  supabaseFactory?: (request: NextRequest) => Promise<AuthClient>
}

export type BuildingCoverAdminIdentityResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-.*-auth-token/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProductionRuntime(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === 'production' || (env.VERCEL_ENV ?? '').startsWith('production')
}

function isAllowlisted(email: unknown, env: Record<string, string | undefined>): boolean {
  if (typeof email !== 'string' || email.trim() === '') return false
  const allowlist = (env.NAVI_ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(email.trim().toLowerCase())
}

function authorizeCampus(user: VerifiedUser, campusId: string, env: Record<string, string | undefined>): NextResponse | null {
  // Deliberately pass only verified email/app_metadata. Never pass user_metadata.
  const identity = { email: user.email, app_metadata: user.app_metadata }
  if (!isAdminIdentity(identity, env)) {
    return NextResponse.json({ error: 'Administrator authorization required.' }, { status: 403 })
  }

  const role = user.app_metadata?.role
  if (role === 'super_admin' || isAllowlisted(user.email, env)) return null
  if (role === 'campus_admin' && user.app_metadata?.campus_id === campusId) return null
  return NextResponse.json({ error: 'Administrator authorization required for this campus.' }, { status: 403 })
}

function mockIdentity(raw: string): VerifiedUser | null {
  const decoded = decodeMockSession(raw)
  if (!isRecord(decoded) || typeof decoded.id !== 'string' || typeof decoded.role !== 'string') return null
  return {
    id: decoded.id,
    email: typeof decoded.email === 'string' ? decoded.email : null,
    app_metadata: {
      role: decoded.role,
      campus_id: typeof decoded.campus_id === 'string' ? decoded.campus_id : null,
    },
  }
}

/** Return verified user identity after enforcing trusted campus scope. */
export async function getBuildingCoverAdminIdentity(
  request: NextRequest,
  campusId: string,
  options: BuildingCoverAuthOptions = {},
): Promise<BuildingCoverAdminIdentityResult> {
  const env = options.env ?? process.env
  let cookies: Array<{ name: string; value: string }> = []
  try {
    cookies = request.cookies?.getAll?.() ?? []
  } catch {
    cookies = []
  }

  const hasSupabaseSession = cookies.some(
    (cookie) => SUPABASE_AUTH_COOKIE_PATTERN.test(cookie.name) && cookie.value !== '',
  )
  if (!hasSupabaseSession) {
    if (!isProductionRuntime(env) && env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
      const raw = cookies.find((cookie) => cookie.name === MOCK_COOKIE)?.value ?? ''
      const user = raw ? mockIdentity(raw) : null
      if (user?.id) {
        const response = authorizeCampus(user, campusId, env)
        return response ? { ok: false, response } : { ok: true, userId: user.id }
      }
    }
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  let user: VerifiedUser | null = null
  try {
    const client = options.supabaseFactory
      ? await options.supabaseFactory(request)
      : createServerClient(
          env.NEXT_PUBLIC_SUPABASE_URL ?? '',
          env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          {
            cookies: {
              getAll: () => cookies.map(({ name, value }) => ({ name, value })),
              setAll: () => {},
            },
          },
        ) as unknown as AuthClient
    const result = await client.auth.getUser()
    if (result.error) {
      return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
    }
    user = result.data?.user ?? null
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  if (!user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }
  const response = authorizeCampus(user, campusId, env)
  return response ? { ok: false, response } : { ok: true, userId: user.id }
}

/** Compatibility-style guard for callers that only need allow/deny. */
export async function requireBuildingCoverAdmin(
  request: NextRequest,
  campusId: string,
  options: BuildingCoverAuthOptions = {},
): Promise<NextResponse | null> {
  const result = await getBuildingCoverAdminIdentity(request, campusId, options)
  return result.ok ? null : result.response
}
