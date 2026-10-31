// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertStudioDatabaseTarget } from './studio-db'

// These tests never open a connection: the guard is pure and Pool construction is lazy.

const PROTECTED = 'scvgulusmutnzasmgysx'
const OTHER_REF = 'abcdefghij0123456789' // 20 lowercase alphanumerics
const PASSWORD = 'S3cretPassw0rdValue'
const LOCAL = `postgresql://navi_studio_api_login:${PASSWORD}@127.0.0.1:55434/navi_savev2_test`

const noEnv: Record<string, string | undefined> = {}

function refusal(url: string, env: Record<string, string | undefined> = noEnv): Error {
  try {
    assertStudioDatabaseTarget(url, env)
  } catch (error) {
    return error as Error
  }
  throw new Error(`expected the guard to refuse ${url.replace(PASSWORD, '***')}`)
}

describe('assertStudioDatabaseTarget', () => {
  it('refuses scvgulusmutnzasmgysx host', () => {
    const url = `postgresql://postgres:${PASSWORD}@db.${PROTECTED}.supabase.co:5432/postgres`
    expect(() => assertStudioDatabaseTarget(url, noEnv)).toThrow(/protected/i)
  })

  it('refuses the protected project even when the allowed ref env names it', () => {
    const url = `postgresql://postgres:${PASSWORD}@db.${PROTECTED}.supabase.co:5432/postgres`
    expect(() => assertStudioDatabaseTarget(url, { NAVI_STUDIO_ALLOWED_DB_REF: PROTECTED })).toThrow(/protected/i)
  })

  it('refuses a URL whose username contains the protected ref even with a matching allowed ref env', () => {
    const url = `postgresql://postgres.${PROTECTED}:${PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
    expect(() => assertStudioDatabaseTarget(url, { NAVI_STUDIO_ALLOWED_DB_REF: PROTECTED })).toThrow(/protected/i)
    expect(() => assertStudioDatabaseTarget(url, { NAVI_STUDIO_ALLOWED_DB_REF: OTHER_REF })).toThrow(/protected/i)
  })

  it('refuses the protected ref in the path, in upper case and when percent-encoded', () => {
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://u:${PASSWORD}@127.0.0.1:55434/${PROTECTED}`, noEnv),
    ).toThrow(/protected/i)
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://u:${PASSWORD}@DB.${PROTECTED.toUpperCase()}.SUPABASE.CO:5432/postgres`, {
        NAVI_STUDIO_ALLOWED_DB_REF: PROTECTED,
      }),
    ).toThrow(/protected/i)
    const encoded = PROTECTED.split('').map((ch) => `%${ch.charCodeAt(0).toString(16)}`).join('')
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres.${encoded}:${PASSWORD}@pooler.supabase.com:6543/postgres`, noEnv),
    ).toThrow(/protected/i)
  })

  it('refuses 127.0.0.1:5432', () => {
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@127.0.0.1:5432/navi_savev2_test`, noEnv),
    ).toThrow(/refus/i)
  })

  it('refuses the local host with another database name', () => {
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@127.0.0.1:55434/postgres`, noEnv),
    ).toThrow(/refus/i)
  })

  it('allows the local test target', () => {
    expect(() => assertStudioDatabaseTarget(LOCAL, noEnv)).not.toThrow()
    expect(() => assertStudioDatabaseTarget(LOCAL)).not.toThrow()
  })

  it('allows host containing NAVI_STUDIO_ALLOWED_DB_REF', () => {
    const env = { NAVI_STUDIO_ALLOWED_DB_REF: OTHER_REF }
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@db.${OTHER_REF}.supabase.co:5432/postgres`, env),
    ).not.toThrow()
  })

  it('allows a pooler URL whose username ends with .<ref>', () => {
    const env = { NAVI_STUDIO_ALLOWED_DB_REF: OTHER_REF }
    expect(() =>
      assertStudioDatabaseTarget(
        `postgresql://postgres.${OTHER_REF}:${PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
        env,
      ),
    ).not.toThrow()
  })

  it('refuses a remote host when no allowed ref is configured', () => {
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@db.${OTHER_REF}.supabase.co:5432/postgres`, noEnv),
    ).toThrow(/refus/i)
  })

  it('refuses a remote host that does not carry the allowed ref', () => {
    const env = { NAVI_STUDIO_ALLOWED_DB_REF: OTHER_REF }
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres`, env),
    ).toThrow(/refus/i)
    // A substring of a label is not a label match.
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${PASSWORD}@db.x${OTHER_REF}.supabase.co:5432/postgres`, env),
    ).toThrow(/refus/i)
    // The ref in the password or path is not enough.
    expect(() =>
      assertStudioDatabaseTarget(`postgresql://postgres:${OTHER_REF}@evil.example.com:5432/${OTHER_REF}`, env),
    ).toThrow(/refus/i)
  })

  it('refuses an allowed-ref env that is not 20 lowercase alphanumerics', () => {
    const url = (ref: string) => `postgresql://postgres:${PASSWORD}@db.${ref}.supabase.co:5432/postgres`
    for (const ref of ['', 'short', OTHER_REF.toUpperCase(), `${OTHER_REF}x`, 'abcdefghij012345678-', 'abcdefghij 123456789']) {
      expect(() => assertStudioDatabaseTarget(url(ref || 'x'), { NAVI_STUDIO_ALLOWED_DB_REF: ref }), `ref "${ref}"`).toThrow(
        /refus/i,
      )
    }
  })

  it('refuses a URL that is not a postgres URL or does not parse', () => {
    expect(() => assertStudioDatabaseTarget('not a url', noEnv)).toThrow(/refus/i)
    expect(() => assertStudioDatabaseTarget('https://127.0.0.1:55434/navi_savev2_test', noEnv)).toThrow(/refus/i)
    expect(() => assertStudioDatabaseTarget('', noEnv)).toThrow(/refus/i)
  })

  it('never puts the password or the user name in an error message', () => {
    const urls = [
      `postgresql://postgres.${PROTECTED}:${PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres:${PASSWORD}@127.0.0.1:5432/navi_savev2_test`,
      `postgresql://someone:${PASSWORD}@db.${OTHER_REF}.supabase.co:5432/postgres`,
      `postgresql://someone:${PASSWORD}@@@bad host:5432/x`,
      `https://someone:${PASSWORD}@127.0.0.1:55434/navi_savev2_test`,
    ]
    for (const url of urls) {
      const error = refusal(url, { NAVI_STUDIO_ALLOWED_DB_REF: 'zzzzzzzzzzzzzzzzzzzz' })
      expect(error.message).not.toContain(PASSWORD)
      expect(error.message).not.toContain('someone')
      expect(error.message).not.toMatch(/postgres\.scvg/i)
    }
  })
})

describe('getStudioPool', () => {
  const saved = {
    url: process.env.NAVI_STUDIO_DATABASE_URL,
    ref: process.env.NAVI_STUDIO_ALLOWED_DB_REF,
    ca: process.env.NAVI_STUDIO_DB_CA_PEM,
  }

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  beforeEach(() => {
    vi.resetModules()
    delete process.env.NAVI_STUDIO_DATABASE_URL
    delete process.env.NAVI_STUDIO_ALLOWED_DB_REF
    delete process.env.NAVI_STUDIO_DB_CA_PEM
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    restore('NAVI_STUDIO_DATABASE_URL', saved.url)
    restore('NAVI_STUDIO_ALLOWED_DB_REF', saved.ref)
    restore('NAVI_STUDIO_DB_CA_PEM', saved.ca)
  })

  it('getStudioPool throws when window is defined', async () => {
    process.env.NAVI_STUDIO_DATABASE_URL = LOCAL
    vi.stubGlobal('window', {})
    const { getStudioPool } = await import('./studio-db')
    expect(() => getStudioPool()).toThrow(/server/i)
  })

  it('getStudioPool throws naming NAVI_STUDIO_DATABASE_URL when it is unset', async () => {
    const { getStudioPool } = await import('./studio-db')
    expect(() => getStudioPool()).toThrow(/NAVI_STUDIO_DATABASE_URL/)
  })

  it('getStudioPool refuses a protected target before creating a pool', async () => {
    process.env.NAVI_STUDIO_DATABASE_URL = `postgresql://postgres:${PASSWORD}@db.${PROTECTED}.supabase.co:5432/postgres`
    process.env.NAVI_STUDIO_ALLOWED_DB_REF = PROTECTED
    const { getStudioPool } = await import('./studio-db')
    let message = ''
    try {
      getStudioPool()
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/protected/i)
    expect(message).not.toContain(PASSWORD)
  })

  it('creates one pool with the pinned settings and no TLS for the local target', async () => {
    process.env.NAVI_STUDIO_DATABASE_URL = LOCAL
    const { getStudioPool } = await import('./studio-db')
    const pool = getStudioPool()
    try {
      expect(getStudioPool()).toBe(pool)
      const options = (pool as unknown as { options: Record<string, unknown> }).options
      expect(options.max).toBe(3)
      expect(options.idleTimeoutMillis).toBe(10_000)
      expect(options.connectionTimeoutMillis).toBe(5_000)
      expect(options.application_name).toBe('navi-studio-v2')
      expect(options.host).toBe('127.0.0.1')
      expect(Number(options.port)).toBe(55434)
      expect(options.database).toBe('navi_savev2_test')
      expect(options.ssl).toBeFalsy()
    } finally {
      await pool.end()
    }
  })

  it('verifies TLS for a remote target, with the optional CA, and ignores sslmode in the URL', async () => {
    process.env.NAVI_STUDIO_ALLOWED_DB_REF = OTHER_REF
    process.env.NAVI_STUDIO_DB_CA_PEM = '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----'
    process.env.NAVI_STUDIO_DATABASE_URL =
      `postgresql://postgres.${OTHER_REF}:${encodeURIComponent('p@ss/word')}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=disable`
    const { getStudioPool } = await import('./studio-db')
    const pool = getStudioPool()
    try {
      const options = (pool as unknown as { options: Record<string, unknown> }).options
      expect(options.ssl).toEqual({ rejectUnauthorized: true, ca: process.env.NAVI_STUDIO_DB_CA_PEM })
      expect(options.user).toBe(`postgres.${OTHER_REF}`)
      expect(options.password).toBe('p@ss/word')
      expect(options.host).toBe('aws-0-ap-southeast-1.pooler.supabase.com')
      expect(Number(options.port)).toBe(6543)
    } finally {
      await pool.end()
    }
  })

  it('studioRepo does not connect or read the environment at import time, only on first use', async () => {
    const { studioRepo } = await import('./studio-repo')
    expect(studioRepo).toBeDefined()
    expect(() => studioRepo.load('c1')).toThrow(/NAVI_STUDIO_DATABASE_URL/)
  })
})
