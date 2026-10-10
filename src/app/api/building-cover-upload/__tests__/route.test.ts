// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { POST } from '../route'

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  protectedCampus: vi.fn(),
  ownership: vi.fn(),
  readR2Config: vi.fn(),
  presignPut: vi.fn(),
  head: vi.fn(),
  createToken: vi.fn(),
  verifyToken: vi.fn(),
}))

vi.mock('@/lib/building-cover-auth', () => ({ getBuildingCoverAdminIdentity: mocks.identity }))
vi.mock('@/lib/api-guard', () => ({ assertCampusMutationAllowed: mocks.protectedCampus }))
vi.mock('@/lib/building-cover-repository', () => ({ checkAuthoredBuildingOwnership: mocks.ownership }))
vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>()
  return { ...actual, readR2Config: mocks.readR2Config }
})
vi.mock('@/lib/building-cover-r2', () => ({
  presignBuildingCoverPut: mocks.presignPut,
  headBuildingCoverObject: mocks.head,
}))
vi.mock('@/lib/building-cover-upload-token', () => ({
  createBuildingCoverUploadToken: mocks.createToken,
  verifyBuildingCoverUploadToken: mocks.verifyToken,
}))

const CONFIG = {
  endpoint: 'https://private-r2-sentinel.example',
  region: 'auto',
  bucket: 'navi-private',
  accessKeyId: 'access-id-sentinel',
  secretAccessKey: 'secret-key-sentinel-value',
}
const SIGN_BODY = { action: 'sign', campusId: 'main-campus', buildingId: 'library', contentType: 'image/png', byteSize: 123 }
const SIGNED_URL = 'https://signed-put.example.invalid/object?X-Amz-Signature=sentinel'
const TOKEN = 'opaque-cover-upload-token'
const CLAIMS = {
  campusId: 'main-campus',
  buildingId: 'library',
  key: 'building-covers/main-campus/library/4b1a2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.png',
  contentType: 'image/png',
  byteSize: 123,
  subject: 'admin-user',
  expiresAt: Math.floor(Date.now() / 1000) + 300,
}

const req = (body: unknown) => new NextRequest('http://localhost/api/building-cover-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const rawReq = (body: string) => new NextRequest('http://localhost/api/building-cover-upload', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
})

beforeEach(() => {
  mocks.identity.mockResolvedValue({ ok: true, userId: 'admin-user' })
  mocks.protectedCampus.mockReturnValue(null)
  mocks.ownership.mockResolvedValue({ ok: true })
  mocks.readR2Config.mockReturnValue({ ok: true, config: CONFIG })
  mocks.presignPut.mockResolvedValue(SIGNED_URL)
  mocks.head.mockResolvedValue({ ok: true, contentType: 'image/png', byteSize: 123 })
  mocks.createToken.mockReturnValue(TOKEN)
  mocks.verifyToken.mockReturnValue(CLAIMS)
})

afterEach(() => vi.clearAllMocks())

describe('POST /api/building-cover-upload', () => {
  it('rejects malformed JSON and unsupported actions', async () => {
    expect((await POST(rawReq('{broken'))).status).toBe(400)
    expect((await POST(req({ action: 'delete' }))).status).toBe(400)
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(mocks.presignPut).not.toHaveBeenCalled()
  })

  it('requires verified admin authorization before repository or storage work', async () => {
    mocks.identity.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) })
    const response = await POST(req(SIGN_BODY))
    expect(response.status).toBe(401)
    expect(mocks.ownership).not.toHaveBeenCalled()
    expect(mocks.readR2Config).not.toHaveBeenCalled()
    expect(mocks.presignPut).not.toHaveBeenCalled()
  })

  it('rejects unsupported MIME types and byte sizes outside 1..8 MiB before signing', async () => {
    for (const body of [
      { ...SIGN_BODY, contentType: 'image/svg+xml' },
      { ...SIGN_BODY, contentType: 'text/html' },
      { ...SIGN_BODY, byteSize: 0 },
      { ...SIGN_BODY, byteSize: 8 * 1024 * 1024 + 1 },
      { ...SIGN_BODY, byteSize: 1.5 },
    ]) expect((await POST(req(body))).status).toBe(400)
    expect(mocks.presignPut).not.toHaveBeenCalled()
    expect(mocks.createToken).not.toHaveBeenCalled()
  })

  it('blocks protected campuses and verifies the authored Building before signing', async () => {
    mocks.protectedCampus.mockReturnValueOnce(NextResponse.json({ error: 'protected' }, { status: 423 }))
    expect((await POST(req({ ...SIGN_BODY, campusId: 'map-map-1-k6bv' }))).status).toBe(423)
    expect(mocks.ownership).not.toHaveBeenCalled()
    expect(mocks.presignPut).not.toHaveBeenCalled()
    mocks.ownership.mockResolvedValueOnce({ ok: false, reason: 'not_found' })
    expect((await POST(req(SIGN_BODY))).status).toBe(404)
    expect(mocks.presignPut).not.toHaveBeenCalled()
  })

  it('generates its own immutable key and returns only the upload grant, never a stable metadata write', async () => {
    const response = await POST(req({ ...SIGN_BODY, key: 'panoramas/main-campus/library/old.jpg', assetId: 'caller-chosen' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ ok: true, uploadUrl: SIGNED_URL, uploadToken: TOKEN, expiresIn: 600, contentType: 'image/png', byteSize: 123 })
    const [grant, secret] = mocks.createToken.mock.calls[0]
    expect(grant).toMatchObject({ campusId: 'main-campus', buildingId: 'library', contentType: 'image/png', byteSize: 123, subject: 'admin-user' })
    expect(grant.key).toMatch(/^building-covers\/main-campus\/library\/[0-9a-f-]{36}\.png$/)
    expect(grant.key).not.toContain('caller-chosen')
    expect(secret).toBe(CONFIG.secretAccessKey)
    expect(mocks.presignPut).toHaveBeenCalledWith(CONFIG, grant.key, 'image/png')
    expect(body).not.toHaveProperty('key')
    expect(JSON.stringify(body)).not.toContain('secret-key-sentinel-value')
    expect(JSON.stringify(body)).not.toContain('private-r2-sentinel.example')
  })

  it('fails closed when R2 configuration or authored-document reads are unavailable', async () => {
    mocks.readR2Config.mockReturnValueOnce({ ok: false, missing: ['R2_SECRET_ACCESS_KEY'] })
    const configResponse = await POST(req(SIGN_BODY))
    expect(configResponse.status).toBe(503)
    expect(await configResponse.json()).toMatchObject({ error: 'missing_configuration', missing: ['R2_SECRET_ACCESS_KEY'] })
    expect(mocks.presignPut).not.toHaveBeenCalled()
    mocks.ownership.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
    expect((await POST(req(SIGN_BODY))).status).toBe(503)
  })

  it('completes only the same admin-bound token after exact HEAD type/size verification', async () => {
    const response = await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      ok: true,
      reference: '/api/building-cover?key=building-covers%2Fmain-campus%2Flibrary%2F4b1a2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.png',
      contentType: 'image/png',
      byteSize: 123,
    })
    expect(mocks.verifyToken).toHaveBeenCalledWith(TOKEN, CONFIG.secretAccessKey)
    expect(mocks.head).toHaveBeenCalledWith(CONFIG, CLAIMS.key)
    expect(JSON.stringify(body)).not.toMatch(/X-Amz|Signature|signed-put/)
  })

  it('rejects an invalid token, different campus/building, or different signing subject before HEAD', async () => {
    mocks.verifyToken.mockReturnValueOnce(null)
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(401)
    mocks.verifyToken.mockReturnValueOnce({ ...CLAIMS, campusId: 'other-campus' })
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(400)
    mocks.verifyToken.mockReturnValueOnce({ ...CLAIMS, subject: 'another-admin' })
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(403)
    expect(mocks.head).not.toHaveBeenCalled()
  })

  it('leaves completion unsuccessful when the object is missing or HEAD metadata differs', async () => {
    mocks.head.mockResolvedValueOnce({ ok: false, notFound: true })
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(409)
    mocks.head.mockResolvedValueOnce({ ok: true, contentType: 'image/jpeg', byteSize: 123 })
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(409)
    mocks.head.mockResolvedValueOnce({ ok: true, contentType: 'image/png', byteSize: 124 })
    expect((await POST(req({ action: 'complete', campusId: 'main-campus', buildingId: 'library', uploadToken: TOKEN }))).status).toBe(409)
  })

  it('sanitizes storage failures and never echoes exception messages', async () => {
    mocks.presignPut.mockRejectedValue(new Error('private-r2-sentinel.example secret-key-sentinel-value'))
    const response = await POST(req(SIGN_BODY))
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(502)
    expect(body).toContain('presign_failed')
    expect(body).not.toContain('private-r2-sentinel.example')
    expect(body).not.toContain('secret-key-sentinel-value')
  })
})
