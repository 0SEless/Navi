import type { NextRequest } from 'next/server'
import { studioHandlers } from '@/studio-v2/server/default-handlers'

export const runtime = 'nodejs'

export function POST(request: NextRequest) {
  return studioHandlers.locks(request)
}
