import type { NextRequest } from 'next/server'
import { studioPublishHandlers } from '@/studio-v2/server/default-publish-handlers'

export const runtime = 'nodejs'

// POST { campusId, commitNo } publishes a saved commit; POST { campusId, rollbackTo }
// points the public map at an earlier publication.
export function POST(request: NextRequest) {
  return studioPublishHandlers.publish(request)
}
