import type { CampusMap } from '@/types/campus-map'

export const TEST_CAMPUS_ID = 'navi-persistence-test-1791537831751-m7ckux03'
export const TEST_CAMPUS_PROJECT_REF = 'scvgulusmutnzasmgysx'
export const TEST_CAMPUS_OPT_IN_KEY = 'navi-test-studio-campus-opt-in'

export interface TestCampusCatalogContext {
  nodeEnv: string
  supabaseUrl: string | undefined
  optedInCampusId: string | null
}

export function isTestCampusCatalogEnabled(
  requestedCampusId: string,
  context: TestCampusCatalogContext,
): boolean {
  if (context.nodeEnv !== 'development' || requestedCampusId !== TEST_CAMPUS_ID) return false
  if (context.optedInCampusId !== TEST_CAMPUS_ID) return false

  try {
    const url = new URL(context.supabaseUrl ?? '')
    return url.protocol === 'https:' && url.hostname === `${TEST_CAMPUS_PROJECT_REF}.supabase.co`
  } catch {
    return false
  }
}

export function buildTestCampusMap(
  requestedCampusId: string,
  context: TestCampusCatalogContext,
): CampusMap | undefined {
  if (!isTestCampusCatalogEnabled(requestedCampusId, context)) return undefined

  return {
    id: TEST_CAMPUS_ID,
    name: 'NAVI Persistence Test Campus (Local Only)',
    schoolName: 'NAVI Development Tests',
    campusName: 'Disposable persistence fixture',
    boundary: [],
    center: { lat: 0, lng: 0 },
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    stats: { buildings: 0, nodes: 0, edges: 0 },
  }
}

export function resolveStudioCampusMap(
  requestedCampusId: string,
  serverMaps: CampusMap[],
): CampusMap | undefined {
  const serverMap = serverMaps.find((map) => map.id === requestedCampusId)
  if (serverMap) return serverMap

  // This compile-time guard is replaced with "production" in production builds.
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return undefined

  let optedInCampusId: string | null = null
  try {
    optedInCampusId = window.localStorage.getItem(TEST_CAMPUS_OPT_IN_KEY)
  } catch {
    return undefined
  }

  return buildTestCampusMap(requestedCampusId, {
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    optedInCampusId,
  })
}
