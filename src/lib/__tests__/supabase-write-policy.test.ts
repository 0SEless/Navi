import { describe, expect, it } from 'vitest'
import { evaluateSupabaseWriteTarget, extractSupabaseKeyProjectRef, resolveDeploymentEnvironment } from '../supabase-write-policy'

const productionUrl = 'https://oltfaepqcktrumfhadzb.supabase.co'
const developmentUrl = 'https://scvgulusmutnzasmgysx.supabase.co'
const productionLegacySecret = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ ref: 'oltfaepqcktrumfhadzb' })).toString('base64url')}.synthetic`
const developmentModernSecret = 'sb_secret_synthetic-opaque-development-test-key'

describe('Supabase write target policy', () => {
  it('prefers the platform deployment target over a conflicting public marker and NODE_ENV', () => {
    expect(resolveDeploymentEnvironment({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV: 'production',
    })).toBe('preview')
  })

  it('blocks Production Supabase from a Vercel Preview despite NODE_ENV=production', () => {
    const result = evaluateSupabaseWriteTarget({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: productionUrl,
      SUPABASE_SECRET_KEY: developmentModernSecret,
    })

    expect(result).toMatchObject({ ok: false, code: 'PRODUCTION_TARGET' })
  })

  it('allows Preview with the approved Development URL and an opaque modern key', () => {
    expect(evaluateSupabaseWriteTarget({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
      SUPABASE_SECRET_KEY: developmentModernSecret,
    })).toEqual({ ok: true })
  })

  it('blocks a split Preview configuration with a Production key', () => {
    expect(evaluateSupabaseWriteTarget({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
      SUPABASE_SECRET_KEY: productionLegacySecret,
    })).toMatchObject({ ok: false, code: 'CREDENTIAL_PROJECT_MISMATCH' })
  })

  it('blocks Preview when the URL is missing or targets an unapproved project', () => {
    expect(evaluateSupabaseWriteTarget({ VERCEL_ENV: 'preview' })).toMatchObject({
      ok: false,
      code: 'UNVERIFIED_TARGET',
    })
    expect(evaluateSupabaseWriteTarget({
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: 'https://anotherdevelopmentproject.supabase.co',
    })).toMatchObject({ ok: false, code: 'UNVERIFIED_TARGET' })
  })

  it('allows Production only when the Vercel Production target points at Production', () => {
    expect(evaluateSupabaseWriteTarget({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: productionUrl,
      SUPABASE_SECRET_KEY: 'sb_secret_synthetic-opaque-production-test-key',
    })).toEqual({ ok: true })
    expect(evaluateSupabaseWriteTarget({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
    })).toMatchObject({ ok: false, code: 'UNVERIFIED_TARGET' })
  })

  it('allows the test harness without configured Supabase variables', () => {
    expect(evaluateSupabaseWriteTarget({ NODE_ENV: 'test' })).toEqual({ ok: true })
  })

  it('does not infer a project ref from modern opaque API key suffixes', () => {
    expect(extractSupabaseKeyProjectRef(developmentModernSecret)).toBeNull()
  })
})
