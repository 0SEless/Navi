import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeR2Error, type R2Config } from '../r2'
import * as buildingCoverR2Module from '../building-cover-r2'

const mocks = vi.hoisted(() => ({
  createR2Client: vi.fn(),
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}))

vi.mock('../r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../r2')>()
  return { ...actual, createR2Client: mocks.createR2Client }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }))

const api = buildingCoverR2Module as unknown as {
  BUILDING_COVER_PUT_TTL_SECONDS: number
  BUILDING_COVER_GET_TTL_SECONDS: number
  presignBuildingCoverPut(config: R2Config, key: string, contentType: string): Promise<string>
  headBuildingCoverObject(config: R2Config, key: string): Promise<{ ok: true; contentType: string; byteSize: number } | { ok: false; notFound: true }>
  presignBuildingCoverGet(config: R2Config, key: string): Promise<string>
}

const config: R2Config = {
  endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'navi-360-dev',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key-value',
}
const key = 'building-covers/main-campus/library/4b1a2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.webp'

describe('isolated building-cover R2 operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubEnv('NAVI_R2_EXPECTED_ACCOUNT_ID', '')
    mocks.createR2Client.mockReturnValue({ send: mocks.send })
    mocks.getSignedUrl.mockResolvedValue('https://signed.example.invalid/object')
    mocks.send.mockResolvedValue({ ContentType: 'image/webp', ContentLength: 12345 })
  })

  it('presigns a private, exact-key PUT with the approved content type and short TTL', async () => {
    expect(api.BUILDING_COVER_PUT_TTL_SECONDS).toBe(600)
    await expect(api.presignBuildingCoverPut(config, key, 'image/webp')).resolves.toBe('https://signed.example.invalid/object')
    expect(mocks.createR2Client).toHaveBeenCalledWith(config)
    const [client, command, options] = mocks.getSignedUrl.mock.calls[0]
    expect(client).toEqual({ send: mocks.send })
    expect(command.input).toMatchObject({ Bucket: config.bucket, Key: key, ContentType: 'image/webp' })
    expect(command.input.ACL).toBeUndefined()
    expect(options).toEqual({ expiresIn: 600 })
  })

  it('rejects another namespace, malformed key, or unsupported type before any R2 call', async () => {
    await expect(api.presignBuildingCoverPut(config, 'panoramas/main-campus/library/a.jpg', 'image/jpeg')).rejects.toThrow(TypeError)
    await expect(api.presignBuildingCoverPut(config, key, 'text/html')).rejects.toThrow(TypeError)
    await expect(api.headBuildingCoverObject(config, 'building-covers/../library/a.png')).rejects.toThrow(TypeError)
    await expect(api.presignBuildingCoverGet(config, 'panoramas/main-campus/library/a.jpg')).rejects.toThrow(TypeError)
    expect(mocks.createR2Client).not.toHaveBeenCalled()
    expect(mocks.getSignedUrl).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('HEAD verifies exactly one cover object and returns stored type and size', async () => {
    await expect(api.headBuildingCoverObject(config, key)).resolves.toEqual({ ok: true, contentType: 'image/webp', byteSize: 12345 })
    const command = mocks.send.mock.calls[0][0]
    expect(command.input).toEqual({ Bucket: config.bucket, Key: key })
  })

  it('collapses only not-found HEAD responses and rethrows other storage errors', async () => {
    mocks.send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }))
    await expect(api.headBuildingCoverObject(config, key)).resolves.toEqual({ ok: false, notFound: true })
    const failure = Object.assign(new Error('private-endpoint-secret'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } })
    mocks.send.mockRejectedValueOnce(failure)
    await expect(api.headBuildingCoverObject(config, key)).rejects.toBe(failure)
    const safe = sanitizeR2Error(failure)
    expect(safe).toEqual({ code: 'InternalError', httpStatus: 500 })
    expect(JSON.stringify(safe)).not.toContain('private-endpoint-secret')
  })

  it('presigns short-lived immutable GET responses with safe image headers', async () => {
    expect(api.BUILDING_COVER_GET_TTL_SECONDS).toBe(900)
    await api.presignBuildingCoverGet(config, key)
    const [, command, options] = mocks.getSignedUrl.mock.calls[0]
    expect(command.input).toMatchObject({
      Bucket: config.bucket,
      Key: key,
      ResponseContentType: 'image/webp',
      ResponseContentDisposition: 'inline',
      ResponseCacheControl: 'public, max-age=31536000, immutable',
    })
    expect(options).toEqual({ expiresIn: 900 })
  })
})
