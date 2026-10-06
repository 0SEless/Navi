/**
 * Contract tests for centralised privileged Supabase credential resolution.
 *
 * These assert the MIGRATION CONTRACT, not any specific credential:
 *   - SUPABASE_SECRET_KEY is preferred when both variables are set
 *   - SUPABASE_SERVICE_ROLE_KEY remains a working fallback
 *   - neither variable may be exposed via a NEXT_PUBLIC_* alias
 *   - diagnostics report variable NAMES only, never values
 *
 * No real credential value appears here. Every literal below is an obvious placeholder.
 */
import { describe, it, expect } from 'vitest'
import {
  SUPABASE_SECRET_KEY_VARS,
  resolveSupabaseSecretKey,
  supabaseSecretKeyOrUndefined,
  missingSupabaseSecretKeyVars,
  assertNotPublicSecretVars,
} from '../supabase-privileged'

// Obvious placeholders, never real credentials.
const PLACEHOLDER_SECRET = 'placeholder-sb-secret-value'
const PLACEHOLDER_LEGACY = 'placeholder-legacy-service-role-value'
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'

const envWith = (over: Record<string, string | undefined>) => ({
  NEXT_PUBLIC_SUPABASE_URL: PLACEHOLDER_URL,
  ...over,
})

describe('resolveSupabaseSecretKey', () => {
  it('prefers SUPABASE_SECRET_KEY when both variables are configured', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
    )
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.source).toBe('SUPABASE_SECRET_KEY')
    expect(resolution.key).toBe(PLACEHOLDER_SECRET)
  })

  it('falls back to SUPABASE_SERVICE_ROLE_KEY when the new key is absent', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
    )
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.source).toBe('SUPABASE_SERVICE_ROLE_KEY')
    expect(resolution.key).toBe(PLACEHOLDER_LEGACY)
  })

  it('treats a blank SUPABASE_SECRET_KEY as absent and still falls back', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SECRET_KEY: '   ', SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
    )
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.source).toBe('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('reports BOTH variable names as missing when neither is configured', () => {
    const resolution = resolveSupabaseSecretKey(envWith({}))
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.missing).toEqual(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
  })

  it('never includes a credential value in the missing-variable report', () => {
    const resolution = resolveSupabaseSecretKey(
      envWith({ SUPABASE_SECRET_KEY: '  ', SUPABASE_SERVICE_ROLE_KEY: '  ' }),
    )
    expect(resolution.ok).toBe(false)
    const serialised = JSON.stringify(resolution)
    expect(serialised).not.toContain(PLACEHOLDER_SECRET)
    expect(serialised).not.toContain(PLACEHOLDER_LEGACY)
  })

  it('declares the new key first in preference order', () => {
    expect(SUPABASE_SECRET_KEY_VARS[0]).toBe('SUPABASE_SECRET_KEY')
    expect(SUPABASE_SECRET_KEY_VARS).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})

describe('supabaseSecretKeyOrUndefined', () => {
  it('preserves the legacy pass-through behaviour when nothing is configured', () => {
    expect(supabaseSecretKeyOrUndefined(envWith({}))).toBeUndefined()
  })

  it('returns the preferred key when only the new variable is set', () => {
    expect(supabaseSecretKeyOrUndefined(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })))
      .toBe(PLACEHOLDER_SECRET)
  })

  it('returns the legacy key when only the legacy variable is set', () => {
    expect(supabaseSecretKeyOrUndefined(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })))
      .toBe(PLACEHOLDER_LEGACY)
  })
})

describe('missingSupabaseSecretKeyVars', () => {
  it('lists only the variable that is absent', () => {
    expect(missingSupabaseSecretKeyVars(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })))
      .toEqual(['SUPABASE_SERVICE_ROLE_KEY'])
  })

  it('lists the legacy variable as still missing during a partial migration', () => {
    // This is the expected state of a deployment that has not yet published the new key.
    expect(missingSupabaseSecretKeyVars(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })))
      .toEqual(['SUPABASE_SECRET_KEY'])
  })

  it('lists nothing once both variables are configured', () => {
    expect(
      missingSupabaseSecretKeyVars(
        envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      ),
    ).toEqual([])
  })
})

describe('assertNotPublicSecretVars', () => {
  it('accepts an environment with only server-side privileged variables', () => {
    expect(() =>
      assertNotPublicSecretVars(
        envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      ),
    ).not.toThrow()
  })

  it('rejects a NEXT_PUBLIC_ alias of the new secret key', () => {
    expect(() =>
      assertNotPublicSecretVars(
        envWith({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }),
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/)
  })

  it('rejects a NEXT_PUBLIC_ alias of the legacy service role key', () => {
    expect(() =>
      assertNotPublicSecretVars(
        envWith({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      ),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
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
