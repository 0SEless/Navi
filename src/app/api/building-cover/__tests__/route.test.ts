// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../route'

const mocks = vi.hoisted(() => ({
  readR2Config: vi.fn(),
  head: vi.fn(),
  presignGet: vi.fn(),
}))

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>()
  return { ...actual, readR2Config: mocks.readR2Config }
})
vi.mock('@/lib/building-cover-r2', () => ({
  headBuildingCoverObject: mocks.head,
  presignBuildingCoverGet: mocks.presignGet,
}))

const CONFIG = {
  endpoint: 'https://private-r2-sentinel.example',
  region: 'auto',
  bucket: 'navi-private',
  accessKeyId: 'access-id-sentinel',
  secretAccessKey: 'secret-key-sentinel-value',
}
const KEY = 'building-covers/main-campus/library/4b1a2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.webp'
const SIGNED_GET = 'https://signed-get.example.invalid/object?X-Amz-Signature=sentinel'
const req = (query: string) => new NextRequest(`http://localhost/api/building-cover${query ? `?${query}` : ''}`)

beforeEach(() => {
  mocks.readR2Config.mockReturnValue({ ok: true, config: CONFIG })
  mocks.head.mockResolvedValue({ ok: true, contentType: 'image/webp', byteSize: 12345 })
  mocks.presignGet.mockResolvedValue(SIGNED_GET)
})

afterEach(() => vi.clearAllMocks())

describe('GET /api/building-cover stable public resolver', () => {
  it('rejects missing, duplicate, extra, or non-building-cover query keys before storage', async () => {
    for (const query of [
      '',
      `key=${encodeURIComponent(KEY)}&key=${encodeURIComponent(KEY)}`,
      `key=${encodeURIComponent(KEY)}&x=1`,
      `key=${encodeURIComponent('panoramas/main-campus/library/a.jpg')}`,
      `key=${encodeURIComponent('building-covers/main-campus/library/../../private.png')}`,
    ]) expect((await GET(req(query))).status).toBe(400)
    expect(mocks.readR2Config).not.toHaveBeenCalled()
    expect(mocks.head).not.toHaveBeenCalled()
    expect(mocks.presignGet).not.toHaveBeenCalled()
  })

  it('returns a short-cache same-origin redirect only after HEAD verifies the immutable raster object', async () => {
    const response = await GET(req(`key=${encodeURIComponent(KEY)}`))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(SIGNED_GET)
    expect(response.headers.get('cache-control')).toBe('public, max-age=30, stale-while-revalidate=60')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.head).toHaveBeenCalledWith(CONFIG, KEY)
    expect(mocks.presignGet).toHaveBeenCalledWith(CONFIG, KEY)
  })

  it('hides missing objects and objects whose stored type or size is invalid', async () => {
    mocks.head.mockResolvedValueOnce({ ok: false, notFound: true })
    expect((await GET(req(`key=${encodeURIComponent(KEY)}`))).status).toBe(404)
    mocks.head.mockResolvedValueOnce({ ok: true, contentType: 'image/jpeg', byteSize: 12345 })
    expect((await GET(req(`key=${encodeURIComponent(KEY)}`))).status).toBe(404)
    mocks.head.mockResolvedValueOnce({ ok: true, contentType: 'image/webp', byteSize: 8 * 1024 * 1024 + 1 })
    expect((await GET(req(`key=${encodeURIComponent(KEY)}`))).status).toBe(404)
    expect(mocks.presignGet).not.toHaveBeenCalled()
  })

  it('fails closed for missing R2 configuration and sanitizes HEAD/signing errors', async () => {
    mocks.readR2Config.mockReturnValueOnce({ ok: false, missing: ['R2_BUCKET'] })
    const configResponse = await GET(req(`key=${encodeURIComponent(KEY)}`))
    expect(configResponse.status).toBe(503)
    expect(await configResponse.json()).toMatchObject({ error: 'missing_configuration', missing: ['R2_BUCKET'] })
    const privateError = new Error('private-r2-sentinel.example secret-key-sentinel-value')
    mocks.head.mockRejectedValueOnce(privateError)
    const headResponse = await GET(req(`key=${encodeURIComponent(KEY)}`))
    expect(headResponse.status).toBe(502)
    expect(await headResponse.text()).not.toMatch(/private-r2-sentinel|secret-key-sentinel/)
    mocks.presignGet.mockRejectedValueOnce(privateError)
    const signResponse = await GET(req(`key=${encodeURIComponent(KEY)}`))
    expect(signResponse.status).toBe(502)
    expect(await signResponse.text()).not.toMatch(/private-r2-sentinel|secret-key-sentinel/)
  })
})
