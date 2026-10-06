/**
 * Tests for the credential-source indicator.
 *
 * The point of these tests is as much about what the indicator must NOT reveal as what it
 * must: the response is a closed three-value enum, so it can never be used as a credential
 * oracle. All values here are obvious placeholders.
 */
import { describe, it, expect } from 'vitest'
import { privilegedCredentialSourceIndicator } from '../supabase-privileged'

const PLACEHOLDER_SECRET = 'placeholder-sb-secret-value'
const PLACEHOLDER_LEGACY = 'placeholder-legacy-service-role-value'
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'

const envWith = (over: Record<string, string | undefined>) => ({
  NEXT_PUBLIC_SUPABASE_URL: PLACEHOLDER_URL,
  ...over,
})

describe('privilegedCredentialSourceIndicator', () => {
  it('reports "secret" when the new key is configured', () => {
    expect(privilegedCredentialSourceIndicator(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })))
      .toBe('secret')
  })

  it('reports "secret" when BOTH are configured, because the new key is preferred', () => {
    expect(
      privilegedCredentialSourceIndicator(
        envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET, SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      ),
    ).toBe('secret')
  })

  it('reports "legacy" when only the legacy key is configured', () => {
    expect(
      privilegedCredentialSourceIndicator(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })),
    ).toBe('legacy')
  })

  it('reports "missing" when neither is configured', () => {
    expect(privilegedCredentialSourceIndicator(envWith({}))).toBe('missing')
  })

  it('treats a blank new key as absent and falls back to "legacy"', () => {
    expect(
      privilegedCredentialSourceIndicator(
        envWith({ SUPABASE_SECRET_KEY: '   ', SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      ),
    ).toBe('legacy')
  })

  it('treats a blank legacy key as missing', () => {
    expect(
      privilegedCredentialSourceIndicator(
        envWith({ SUPABASE_SECRET_KEY: '  ', SUPABASE_SERVICE_ROLE_KEY: '' }),
      ),
    ).toBe('missing')
  })

  it('returns only the three permitted values for any input', () => {
    const cases = [
      envWith({}),
      envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET }),
      envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY }),
      envWith({ SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' }),
      envWith({ SUPABASE_SECRET_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b' }),
    ]
    for (const env of cases) {
      expect(['secret', 'legacy', 'missing']).toContain(privilegedCredentialSourceIndicator(env))
    }
  })

  it('carries no key material, length, hash, prefix, or variable name', () => {
    const indicators = [
      privilegedCredentialSourceIndicator(envWith({ SUPABASE_SECRET_KEY: PLACEHOLDER_SECRET })),
      privilegedCredentialSourceIndicator(envWith({ SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_LEGACY })),
      privilegedCredentialSourceIndicator(envWith({})),
    ]
    const serialised = JSON.stringify(indicators)
    // No value, no fragment of a value, no variable name, no digit-bearing derivative.
    expect(serialised).not.toContain(PLACEHOLDER_SECRET)
    expect(serialised).not.toContain(PLACEHOLDER_LEGACY)
    expect(serialised).not.toContain(PLACEHOLDER_SECRET.slice(0, 6))
    expect(serialised).not.toContain(PLACEHOLDER_LEGACY.slice(0, 6))
    expect(serialised).not.toContain('SUPABASE_SECRET_KEY')
    expect(serialised).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(serialised).not.toMatch(/\d/)
  })

  it('is indistinguishable between two different keys from the same variable', () => {
    // The indicator is about WHICH VARIABLE, never about the value.
    const a = privilegedCredentialSourceIndicator(envWith({ SUPABASE_SECRET_KEY: 'x'.repeat(40) }))
    const b = privilegedCredentialSourceIndicator(envWith({ SUPABASE_SECRET_KEY: 'y'.repeat(200) }))
    expect(a).toBe(b)
  })
})
