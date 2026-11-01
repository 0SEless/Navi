import type { NextRequest } from 'next/server'
import { studioHandlers } from '@/studio-v2/server/default-handlers'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return studioHandlers.changes(request, await context.params)
}
