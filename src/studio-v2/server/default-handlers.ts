// The Studio v2 handlers wired to the real repository and the real admin check.
// Built once per server instance; the repository connects lazily on first use, so
// importing this module (for example during `next build`) never opens a connection.
import type { NextRequest } from 'next/server'
import { verifyMutationPrincipal } from '../../lib/api-guard'
import { createStudioHandlers } from './handlers'
import { studioRepo } from './studio-repo'

export const studioHandlers = createStudioHandlers({
  repo: studioRepo,
  verifyPrincipal: (request) => verifyMutationPrincipal(request as NextRequest),
})
