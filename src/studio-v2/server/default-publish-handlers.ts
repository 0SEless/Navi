// The Save v2 publish handlers wired to the real repository and the real admin check.
// Kept apart from default-handlers.ts so only the publish route loads the compiler.
// The repository connects lazily on first use, so importing this module never connects.
import type { NextRequest } from 'next/server'
import { verifyMutationPrincipal } from '../../lib/api-guard'
import { createPublishHandlers } from './publish-handlers'
import { studioRepo } from './studio-repo'

export const studioPublishHandlers = createPublishHandlers({
  repo: studioRepo,
  verifyPrincipal: (request) => verifyMutationPrincipal(request as NextRequest),
})
