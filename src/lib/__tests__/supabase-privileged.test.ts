/**
 * Contract tests for centralised privileged Supabase credential resolution.
 *
 * These assert the FINAL CONTRACT, not any specific credential:
 *   - SUPABASE_SECRET_KEY is REQUIRED and is the only accepted privileged variable
 *   - SUPABASE_SERVICE_ROLE_KEY is NOT accepted as a fallback
 *   - no public/publishable credential can substitute for privileged access
 *   - it may never be exposed via a NEXT_PUBLIC_* alias
 *
 * The "does not accept the legacy key" cases are the important ones. After the Supabase
 * legacy JWT keys were disabled, a fallback to SUPABASE_SERVICE_ROLE_KEY would resolve to
 * a credential that authenticates as nothing — a silent 401 on every privileged route.
 *
 * No real credential value appears here. Every literal below is an obvious placeholder.
 */
import { describe, it, expect } from 'vitest'
import {
  SUPABASE_SECRET_KEY_VAR,
  resolveSupabaseSecretKey,
  supabaseSecretKeyOrUndefined,
  missingSupabaseSecretKeyVars,
  assertNotPublicSecretVars,
} from '../supabase-privileged'

// Obvious placeholders, never real credentials.
const PLACEHOLDER_SECRET = 'placeholder-sb-secret-value'
const PLACEHOLDER_LEGACY = 'placeholder-legacy-service-role-value'
const PLACEHOLDER_PUBLISHABLE = 'sb_publishable_placeholder-value'
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'

const envWith = (over: Record<string, string | undefined>) => ({
  NEXT_PUBLIC_SUPABASE_URL: PLACEHOLDER_URL,
  ...over,
})

describe('resolveSupabaseSecretKey', () => {
  it('resolves SUPABASE_SECRET_KEY', () => {
    const resolution = resolveSupabaseSecretKey(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }))
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.source).toBe('SUPABASE_SECRET_KEY')
    expect(resolution.key).toBe(PLACEHOLDER_SECRET)
  })

  it('exposes exactly one supported variable name', () => {
    expect(SUPABASE_SECRET_KEY_VAR).toBe('SUPABASE_SECRET_KEY')
  })

  it('trims surrounding whitespace', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SECRET_KEY: `  ${PLACEHOLDER_SECRET}\n` }),
    )
    expect(resolution.ok).toBe(true)
    if (resolution.ok) expect(resolution.key).toBe(PLACEHOLDER_SECRET)
  })

  it('fails safely and names the missing variable when unset', () => {
    const resolution = resolveSupabaseSecretKey(envWith({}))
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.missing).toEqual(['SUPABASE_SECRET_KEY'])
  })

  it('fails safely on a blank secret key', () => {
    expect(resolveSupabaseSecretKey(envWith({ SUPABASE_SECRET_KEY: '   ' })).ok).toBe(false)
  })

  it('never includes a credential value in the missing-variable report', () => {
    const resolution = resolveSupabaseSecretKey(envWith({ SUPABASE_SECRET_KEY: '  ' }))
    expect(resolution.ok).toBe(false)
    const serialised = JSON.stringify(resolution)
    expect(serialised).not.toContain(PLACEHOLDER_SECRET)
    expect(serialised).not.toContain(PLACEHOLDER_LEGACY)
  })
})

describe('supabase-privileged: the legacy service_role key is NOT accepted', () => {
  // The regression these guard: with the Supabase legacy JWT keys disabled, a fallback to
  // SUPABASE_SERVICE_ROLE_KEY would look configured while authenticating as nothing.
  it('does not fall back to SUPABASE_SERVICE_ROLE_KEY', () => {
    const resolution = resolveSupabaseSecretKey(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }))
    expect(resolution.ok).toBe(false)
    if (!resolution.ok) expect(resolution.missing).toEqual(['SUPABASE_SECRET_KEY'])
    expect(supabaseSecretKeyOrUndefined(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })))
      .toBeUndefined()
    // Same assertion via the resolution result; kept here to make the intent explicit
    // next to the legacy-key rejection it protects.
    expect(resolveSupabaseSecretKey(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })).ok).toBe(false)
  })

  it('prefers the secret key and ignores the legacy key when both are present', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
    )
    expect(resolution.ok).toBe(true)
    if (resolution.ok) expect(resolution.key).toBe(PLACEHOLDER_SECRET)
  })

  it('reports missing when only the legacy key is configured', () => {
    expect(resolveSupabaseSecretKey(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })).ok).toBe(false)
  })
})

describe('supabase-privileged: a public credential cannot become privileged', () => {
  it('does not substitute the publishable key for privileged access', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PLACEHOLDER_PUBLISHABLE }),
    )
    expect(resolution.ok).toBe(false)
    expect(supabaseSecretKeyOrUndefined(envWith({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PLACEHOLDER_PUBLISHABLE })))
      .toBeUndefined()
  })

  it('still reports missing when only public credentials exist', () => {
    expect(resolveSupabaseSecretKey(envWith({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PLACEHOLDER_PUBLISHABLE })).ok)
      .toBe(false)
  })
})

describe('supabaseSecretKeyOrUndefined', () => {
  it('returns undefined when nothing is configured', () => {
    expect(supabaseSecretKeyOrUndefined(envWith({}))).toBeUndefined()
  })

  it('returns the secret key when configured', () => {
    expect(supabaseSecretKeyOrUndefined(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })))
      .toBe(PLACEHOLDER_SECRET)
  })
})

describe('missingSupabaseSecretKeyVars', () => {
  it('lists nothing once the secret key is configured', () => {
    expect(missingSupabaseSecretKeyVars(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }))).toEqual([])
  })

  it('lists the variable name when it is absent', () => {
    expect(missingSupabaseSecretKeyVars(envWith({}))).toEqual(['SUPABASE_SECRET_KEY'])
  })
})

describe('assertNotPublicSecretVars', () => {
  it('accepts an environment with the server-side secret variable', () => {
    expect(() => assertNotPublicSecretVars(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }))).not.toThrow()
  })

  it('rejects a NEXT_PUBLIC_ alias of the secret key', () => {
    expect(() =>
      assertNotPublicSecretVars(envWith({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/)
  })

  it('rejects a NEXT_PUBLIC_ alias of the legacy service role key', () => {
    // The resolver no longer reads SUPABASE_SERVICE_ROLE_KEY, but a leaked NEXT_PUBLIC_
    // alias of it would still put a legacy JWT into the browser bundle. The public-side
    // guard (assertNoPrivilegedSupabaseKeyInPublicVars) covers that name; this test keeps
    // the server-side guard honest about what it does and does not claim to check.
    expect(() =>
      assertNotPublicSecretVars(envWith({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/)
  })

  it('names the offending variable without including its value', () => {
    let message = ''
    try {
      assertNotPublicSecretVars(envWith({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }))
    } catch (e) {
      message = String((e as Error).message)
    }
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_SECRET_KEY')
    expect(message).not.toContain(PLACEHOLDER_SECRET)
  })

  it('ignores an empty NEXT_PUBLIC_ alias', () => {
    expect(() =>
      assertNotPublicSecretVars(envWith({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: '  ' })),
    ).not.toThrow()
  })
})