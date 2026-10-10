import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampusMap } from '@/types/campus-map'
import {
  buildTestCampusMap,
  isTestCampusCatalogEnabled,
  resolveStudioCampusMap,
  TEST_CAMPUS_ID,
  TEST_CAMPUS_OPT_IN_KEY,
  TEST_CAMPUS_PROJECT_REF,
} from './test-campus-catalog'
import { useCampusMapStore } from '@/store/campus-map-store'

const devContext = {
  nodeEnv: 'development',
  supabaseUrl: `https://${TEST_CAMPUS_PROJECT_REF}.supabase.co`,
  optedInCampusId: TEST_CAMPUS_ID,
}

const serverMap: CampusMap = {
  id: 'server-campus',
  name: 'Existing server campus',
  schoolName: 'Existing school',
  boundary: [],
  center: { lat: 14, lng: 121 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  stats: { buildings: 3, nodes: 4, edges: 2 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  useCampusMapStore.setState({ maps: [], landmarkTypes: [], landmarkInstances: [], selectedMapId: null })
})

describe('development-only Studio test campus catalog overlay', () => {
  it('is disabled by default without the explicit local opt-in', () => {
    expect(isTestCampusCatalogEnabled(TEST_CAMPUS_ID, { ...devContext, optedInCampusId: null })).toBe(false)
    expect(buildTestCampusMap(TEST_CAMPUS_ID, { ...devContext, optedInCampusId: null })).toBeUndefined()
  })

  it('requires development mode and the exact disposable campus ID', () => {
    expect(isTestCampusCatalogEnabled(TEST_CAMPUS_ID, { ...devContext, nodeEnv: 'test' })).toBe(false)
    expect(isTestCampusCatalogEnabled(TEST_CAMPUS_ID, { ...devContext, nodeEnv: 'production' })).toBe(false)
    expect(isTestCampusCatalogEnabled('another-campus', devContext)).toBe(false)
    expect(buildTestCampusMap('another-campus', devContext)).toBeUndefined()
  })

  it('requires the configured development Supabase project', () => {
    expect(isTestCampusCatalogEnabled(TEST_CAMPUS_ID, { ...devContext, supabaseUrl: 'https://wrong-project.supabase.co' })).toBe(false)
    expect(isTestCampusCatalogEnabled(TEST_CAMPUS_ID, { ...devContext, supabaseUrl: undefined })).toBe(false)
  })

  it('builds a valid CampusMap for only the opted-in test campus', () => {
    const map = buildTestCampusMap(TEST_CAMPUS_ID, devContext)
    expect(map).toMatchObject({
      id: TEST_CAMPUS_ID,
      name: expect.any(String),
      schoolName: expect.any(String),
      boundary: [],
      center: { lat: expect.any(Number), lng: expect.any(Number) },
      stats: { buildings: expect.any(Number), nodes: expect.any(Number), edges: expect.any(Number) },
    })
    expect(map?.createdAt).toBeTruthy()
    expect(map?.updatedAt).toBeTruthy()
  })

  it('resolves the test editor after a non-empty server refresh without changing server entries', async () => {
    const refreshedServerMaps = [serverMap]
    const before = structuredClone(refreshedServerMaps)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ maps: refreshedServerMaps }),
    })
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === TEST_CAMPUS_OPT_IN_KEY ? TEST_CAMPUS_ID : null } })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', devContext.supabaseUrl)

    await useCampusMapStore.getState().fetchFromSupabase()
    const mapsAfterRefresh = useCampusMapStore.getState().maps
    const resolvedTestMap = resolveStudioCampusMap(TEST_CAMPUS_ID, mapsAfterRefresh)
    const resolvedServerMap = resolveStudioCampusMap(serverMap.id, mapsAfterRefresh)

    expect(resolvedTestMap?.id).toBe(TEST_CAMPUS_ID)
    expect(resolvedServerMap).toMatchObject(serverMap)
    expect(refreshedServerMaps).toEqual(before)
    expect(mapsAfterRefresh).toHaveLength(1)
    expect(mapsAfterRefresh[0]?.id).toBe(serverMap.id)
  })

  it('does not submit the resolver-only test map to campus catalog synchronization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === TEST_CAMPUS_OPT_IN_KEY ? TEST_CAMPUS_ID : null } })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', devContext.supabaseUrl)

    const resolved = resolveStudioCampusMap(TEST_CAMPUS_ID, [])
    expect(resolved?.id).toBe(TEST_CAMPUS_ID)
    useCampusMapStore.setState({ maps: [serverMap], landmarkTypes: [], landmarkInstances: [] })
    await useCampusMapStore.getState().syncToSupabase()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/campus-maps')
    const submittedBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(submittedBody.id).toBe(serverMap.id)
    expect(JSON.stringify(submittedBody)).not.toContain(TEST_CAMPUS_ID)
  })

  it('cannot activate in production even when the browser opt-in is present', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => TEST_CAMPUS_ID } })
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', devContext.supabaseUrl)

    expect(resolveStudioCampusMap(TEST_CAMPUS_ID, [])).toBeUndefined()
  })
})
