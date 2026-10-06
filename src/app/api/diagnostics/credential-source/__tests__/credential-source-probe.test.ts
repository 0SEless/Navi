/**
 * Tests for the read-only privileged reachability probe.
 *
 * The point is that the probe PROVES reachability without ever moving or revealing data:
 * it issues a `head: true` count query, so no row bodies are requested, and it returns only a
 * status word, an integer count, and sanitized error detail on failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const selectMock = vi.fn()
const fromMock = vi.fn(() => ({ select: selectMock }))
const createServerClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...(args as [])),
}))

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'

let route: typeof import('../route')

beforeEach(async () => {
  selectMock.mockReset()
  fromMock.mockClear()
  createServerClientMock.mockClear()
  route = await import('../route')
  process.env.NEXT_PUBLIC_SUPABASE_URL = PLACEHOLDER_URL
  process.env.SUPABASE_SECRET_KEY = 'placeholder-sb-secret-value'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SECRET_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('probePrivilegedRead', () => {
  it('reports success and the row count when the count query succeeds', async () => {
    selectMock.mockResolvedValue({ count: 0, error: null })
    const r = await route.probePrivilegedRead()
    expect(r).toEqual({ supabaseRead: 'success', rowCount: 0, error: null })
  })

  it('treats a ZERO-row table as success, not failure', async () => {
    selectMock.mockResolvedValue({ count: 0, error: null })
    const r = await route.probePrivilegedRead()
    expect(r.supabaseRead).toBe('success')
    expect(r.rowCount).toBe(0)
  })

  it('reports a non-zero count when rows exist', async () => {
    selectMock.mockResolvedValue({ count: 7, error: null })
    const r = await route.probePrivilegedRead()
    expect(r.supabaseRead).toBe('success')
    expect(r.rowCount).toBe(7)
  })

  it('issues a head:true count query so no row bodies are requested', async () => {
    selectMock.mockResolvedValue({ count: 0, error: null })
    await route.probePrivilegedRead()
    expect(fromMock).toHaveBeenCalledWith('panorama_assets')
    // The decisive assertion: head:true means PostgREST returns a count, not rows.
    expect(selectMock).toHaveBeenCalledWith('key', { head: true, count: 'exact' })
  })

  it('builds a cookie-less client, matching the production privileged path', async () => {
    selectMock.mockResolvedValue({ count: 0, error: null })
    await route.probePrivilegedRead()
    expect(createServerClientMock).toHaveBeenCalledWith(
      PLACEHOLDER_URL,
      'placeholder-sb-secret-value',
      { cookies: { getAll: expect.any(Function), setAll: expect.any(Function) } },
    )
  })

  it('uses the legacy fallback ONLY when the new key is absent', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-legacy-service-role-value'
    selectMock.mockResolvedValue({ count: 0, error: null })
    await route.probePrivilegedRead()
    expect(createServerClientMock).toHaveBeenCalledWith(
      PLACEHOLDER_URL,
      'placeholder-legacy-service-role-value',
      expect.anything(),
    )
  })

  it('reports failure with a sanitized error when Supabase rejects the query', async () => {
    selectMock.mockResolvedValue({
      count: null,
      error: { code: '42501', message: 'permission denied for table panorama_assets', hint: 'SECRET-HINT', details: 'SECRET-DETAIL' },
    })
    const r = await route.probePrivilegedRead()
    expect(r.supabaseRead).toBe('failure')
    expect(r.rowCount).toBe(0)
    expect(r.error).toEqual({ code: '42501', message: 'permission denied for table panorama_assets' })
  })

  it('never returns hint or details from a Supabase error', async () => {
    selectMock.mockResolvedValue({
      count: null,
      error: { code: 'PGRST205', message: 'relation does not exist', hint: 'LEAKY-HINT', details: 'LEAKY-DETAIL' },
    })
    const serialised = JSON.stringify(await route.probePrivilegedRead())
    expect(serialised).not.toContain('LEAKY-HINT')
    expect(serialised).not.toContain('LEAKY-DETAIL')
    expect(serialised).not.toContain('hint')
    expect(serialised).not.toContain('details')
  })

  it('fails closed when the privileged configuration is incomplete', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const r = await route.probePrivilegedRead()
    expect(r.supabaseRead).toBe('failure')
    expect(r.error?.code).toBe('CONFIG_MISSING')
    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it('fails safely when the client throws', async () => {
    createServerClientMock.mockImplementationOnce(() => { throw new Error('boom') })
    selectMock.mockResolvedValue({ count: 0, error: null })
    const r = await route.probePrivilegedRead()
    expect(r.supabaseRead).toBe('failure')
    expect(r.error?.code).toBe('PROBE_EXCEPTION')
  })

  it('never includes credential material in a failure result', async () => {
    createServerClientMock.mockImplementationOnce(() => { throw new Error('boom') })
    const serialised = JSON.stringify(await route.probePrivilegedRead())
    expect(serialised).not.toContain('placeholder-sb-secret-value')
    expect(serialised).not.toContain('SUPABASE_SECRET_KEY')
    expect(serialised).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})
