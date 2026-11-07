import type { NextRequest } from 'next/server'
import { studioPublishHandlers } from '@/studio-v2/server/default-publish-handlers'

export const runtime = 'nodejs'
// Same build as Publish (compiling a full campus can take a while).
export const maxDuration = 60

// POST { campusId, commitNo }: the saved commit as NAVI Web will show it, without publishing (Studio Preview).
export function POST(request: NextRequest) {
  return studioPublishHandlers.preview(request)
}
