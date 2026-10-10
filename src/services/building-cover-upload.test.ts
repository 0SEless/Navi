import { describe, expect, it, vi } from 'vitest'
import { BUILDING_COVER_MAX_BYTES } from '@/lib/building-cover-policy'
import { uploadBuildingCover } from './building-cover-upload'

const key = 'building-covers/map-ds-1/bld-cs/123e4567-e89b-42d3-a456-426614174000.png'
const reference = `/api/building-cover?key=${encodeURIComponent(key)}`
const signedUrl = 'https://r2.example.test/object?X-Amz-Signature=private-signature'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pngFile(size = 4): File {
  return new File([new Uint8Array(size)], 'building.png', { type: 'image/png' })
}

describe('uploadBuildingCover', () => {
  it('validates, signs, uploads without browser credentials, verifies, and returns only the stable reference', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, uploadUrl: signedUrl, uploadToken: 'opaque-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, reference, contentType: 'image/png', byteSize: 4 }))
    const onStage = vi.fn()

    const result = await uploadBuildingCover(pngFile(), 'map-ds-1', 'bld-cs', { fetcher, onStage })

    expect(fetcher).toHaveBeenCalledTimes(3)
    const signInit = fetcher.mock.calls[0][1] as RequestInit
    expect(signInit.method).toBe('POST')
    expect(signInit.credentials).toBe('include')
    expect(JSON.parse(String(signInit.body))).toEqual({
      action: 'sign', campusId: 'map-ds-1', buildingId: 'bld-cs', contentType: 'image/png', byteSize: 4,
    })

    const putInit = fetcher.mock.calls[1][1] as RequestInit
    expect(fetcher.mock.calls[1][0]).toBe(signedUrl)
    expect(putInit.method).toBe('PUT')
    expect(putInit.credentials).toBe('omit')
    expect(putInit.headers).toEqual({ 'Content-Type': 'image/png' })
    expect(putInit.body).toBeInstanceOf(File)

    const completeInit = fetcher.mock.calls[2][1] as RequestInit
    expect(completeInit.credentials).toBe('include')
    expect(JSON.parse(String(completeInit.body))).toEqual({
      action: 'complete', campusId: 'map-ds-1', buildingId: 'bld-cs', uploadToken: 'opaque-token',
    })
    expect(result).toEqual({ reference })
    expect(JSON.stringify(result)).not.toContain('X-Amz')
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['validating', 'signing', 'uploading', 'verifying'])
  })

  it('rejects unsupported types and files over 8 MiB before requesting a signature', async () => {
    const fetcher = vi.fn()
    await expect(uploadBuildingCover(new File(['x'], 'bad.gif', { type: 'image/gif' }), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/JPEG, PNG, or WebP/i)
    await expect(uploadBuildingCover(pngFile(BUILDING_COVER_MAX_BYTES + 1), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/8 MiB/i)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stops when signing fails and does not expose a signed URL in the error', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'presign_failed' }, 502))

    await expect(uploadBuildingCover(pngFile(), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/start the upload/i)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not complete after a failed object PUT', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ uploadUrl: signedUrl, uploadToken: 'opaque-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))

    await expect(uploadBuildingCover(pngFile(), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/upload the image/i)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('surfaces completion verification failure without returning a reference', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ uploadUrl: signedUrl, uploadToken: 'opaque-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'upload_verification_failed' }, 502))

    await expect(uploadBuildingCover(pngFile(), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/verify the uploaded image/i)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rejects a completion response that does not match the selected building and uploaded bytes', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ uploadUrl: signedUrl, uploadToken: 'opaque-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, reference: '/api/building-cover?key=building-covers/other/bld-cs/123e4567-e89b-42d3-a456-426614174000.png', contentType: 'image/png', byteSize: 4 }))

    await expect(uploadBuildingCover(pngFile(), 'map-ds-1', 'bld-cs', { fetcher }))
      .rejects.toThrow(/verify the uploaded image/i)
  })
})
