import { describe, expect, it } from 'vitest'
import * as tokenModule from '../building-cover-upload-token'

const tokenApi = tokenModule as unknown as {
  BUILDING_COVER_UPLOAD_TTL_SECONDS: number
  createBuildingCoverUploadToken(
    input: { campusId: string; buildingId: string; key: string; contentType: string; byteSize: number; subject: string },
    secret: string,
    nowMs?: number,
  ): string
  verifyBuildingCoverUploadToken(token: unknown, secret: string, nowMs?: number): {
    campusId: string; buildingId: string; key: string; contentType: string; byteSize: number; subject: string; expiresAt: number
  } | null
}

const secret = 'test-secret-9f4d2e13b7c1a088'
const grant = {
  campusId: 'main-campus',
  buildingId: 'library_1',
  key: 'building-covers/main-campus/library_1/4b1a2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.webp',
  contentType: 'image/webp',
  byteSize: 12345,
  subject: 'admin-user-1',
}

describe('building cover upload completion token', () => {
  it('signs a short-lived grant and verifies all bound upload claims', () => {
    expect(tokenApi.BUILDING_COVER_UPLOAD_TTL_SECONDS).toBe(600)
    const token = tokenApi.createBuildingCoverUploadToken(grant, secret, 1_800_000_000_000)
    expect(token).toMatch(/^bc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(tokenApi.verifyBuildingCoverUploadToken(token, secret, 1_800_000_001_000)).toEqual({
      ...grant,
      expiresAt: 1_800_000_600,
    })
  })

  it('rejects expired, altered, malformed, or differently signed tokens', () => {
    const token = tokenApi.createBuildingCoverUploadToken(grant, secret, 1_800_000_000_000)
    expect(tokenApi.verifyBuildingCoverUploadToken(token, secret, 1_800_000_600_000)).toBeNull()
    expect(tokenApi.verifyBuildingCoverUploadToken(`${token}x`, secret, 1_800_000_001_000)).toBeNull()
    expect(tokenApi.verifyBuildingCoverUploadToken(token, 'other-secret-9f4d2e13b7c1a088', 1_800_000_001_000)).toBeNull()
    for (const malformed of [null, '', 'a.b', 'bc1.!!!!.????', 4]) {
      expect(tokenApi.verifyBuildingCoverUploadToken(malformed, secret, 1_800_000_001_000)).toBeNull()
    }
  })

  it('refuses grants whose key owner, MIME type, size, or subject do not match', () => {
    for (const override of [
      { campusId: 'other-campus' },
      { buildingId: 'gym' },
      { contentType: 'image/png' },
      { byteSize: 0 },
      { byteSize: 8 * 1024 * 1024 + 1 },
      { subject: '' },
    ]) {
      expect(() => tokenApi.createBuildingCoverUploadToken({ ...grant, ...override }, secret, 1_800_000_000_000)).toThrow(TypeError)
    }
    expect(() => tokenApi.createBuildingCoverUploadToken(grant, '', 1_800_000_000_000)).toThrow(TypeError)
  })
})
