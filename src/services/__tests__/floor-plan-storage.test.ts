import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('@/lib/supabase-client', () => ({ createClient }))
vi.mock('@navi/editor', () => ({
  needsRasterization: () => false,
  rasterizePdfToPng: vi.fn(),
}))

import { deleteFloorPlanImage, uploadFloorPlanImage } from '../floor-plan-storage'

describe('floor-plan storage cleanup ownership', () => {
  const originalEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV: process.env.NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }

  beforeEach(() => {
    createClient.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('does not attempt destructive cleanup without a matching managed scope', async () => {
    await deleteFloorPlanImage('https://external.example/floor-plans/map/building/floor-0-old.png')
    await deleteFloorPlanImage('https://external.example/floor-plans/map/building/floor-0-old.png', {
      supabaseUrl: 'https://storage.example',
      mapId: 'map',
      buildingId: 'building',
      floorLevel: 0,
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('allows cleanup only for the exact managed floor prefix', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    createClient.mockReturnValue({ storage: { from: vi.fn(() => ({ remove })) } })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example'

    await deleteFloorPlanImage('https://storage.example/storage/v1/object/public/floor-plans/map/building/floor-0-old.png', {
      supabaseUrl: 'https://storage.example',
      mapId: 'map',
      buildingId: 'building',
      floorLevel: 0,
    })

    expect(remove).toHaveBeenCalledWith(['map/building/floor-0-old.png'])
  })

  it('blocks direct Preview floor-plan Storage upload and deletion when the URL targets Production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://oltfaepqcktrumfhadzb.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_oltfaepqcktrumfhadzb_synthetic-test-only')
    const floorPlanUrl = 'https://oltfaepqcktrumfhadzb.supabase.co/storage/v1/object/public/floor-plans/map/building/floor-0-old.png'

    await expect(uploadFloorPlanImage(new File(['fixture'], 'floor.png', { type: 'image/png' }), 'map', 'building', 0))
      .rejects.toThrow('Floor-plan Storage writes are disabled for this deployment target.')
    await deleteFloorPlanImage(floorPlanUrl, {
      supabaseUrl: 'https://oltfaepqcktrumfhadzb.supabase.co',
      mapId: 'map',
      buildingId: 'building',
      floorLevel: 0,
    })

    expect(createClient).not.toHaveBeenCalled()
  })

  it('continues to upload floor plans to the approved Development project', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'map/building/floor-0-1.png' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://scvgulusmutnzasmgysx.supabase.co/storage/v1/object/public/floor-plans/map/building/floor-0-1.png' } })
    const from = vi.fn(() => ({ upload, getPublicUrl }))
    createClient.mockReturnValue({ storage: { from } })
    vi.stubEnv('NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV', 'local')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scvgulusmutnzasmgysx.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'synthetic-publishable-test-key')

    const result = await uploadFloorPlanImage(new File(['fixture'], 'floor.png', { type: 'image/png' }), 'map', 'building', 0)

    expect(result).toContain('scvgulusmutnzasmgysx.supabase.co/storage/v1/object/public/floor-plans/')
    expect(upload).toHaveBeenCalledOnce()
    expect(getPublicUrl).toHaveBeenCalledWith('map/building/floor-0-1.png')
  })
})
