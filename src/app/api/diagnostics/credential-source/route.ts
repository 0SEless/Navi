import { NextRequest, NextResponse } from "next/server";
import {
  requireVerifiedMutationAuth,
} from "@/lib/api-guard";
import { privilegedCredentialSourceIndicator } from "@/lib/supabase-privileged";

/**
 * READ-ONLY credential-source diagnostic.
 *
 * Answers exactly one question — "which privileged Supabase credential source does this
 * deployment's resolver select?" — with a single closed-enum word:
 *
 *   { "source": "secret" }   SUPABASE_SECRET_KEY is present and preferred
 *   { "source": "legacy" }   only the legacy SUPABASE_SERVICE_ROLE_KEY is configured
 *   { "source": "missing" }  neither is configured
 *
 * SAFETY PROPERTIES (all deliberate):
 *   - It performs NO Supabase call, NO write, and touches no campus data. It only inspects
 *     which environment variables are present; it never reads a value into the response.
 *   - The response body is exactly one property. No key material and no derivative of it:
 *     not the value, not its length, not a hash or fingerprint, not a prefix, not the
 *     environment variable names, and not how many variables are set. Anything richer would
 *     turn this into a credential oracle.
 *   - It is gated by `requireVerifiedMutationAuth`, which fails closed: 401 without a
 *     session, 403 for a verified non-admin, and a cryptographically verified Supabase
 *     session is required (cookie presence alone is not accepted). DEV mock auth is refused
 *     in production by that guard.
 *   - `no-store` prevents any intermediary from caching the result.
 *
 * Operational note: this exists to confirm the Secret API key migration, after which the
 * legacy credential can be deactivated. It is expected to be short-lived and is a candidate
 * for removal once the migration is verified — it is deliberately admin-only rather than
 * public so that, while it exists, it discloses nothing to an unauthenticated caller.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireVerifiedMutationAuth(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    { source: privilegedCredentialSourceIndicator() },
    { headers: { "cache-control": "no-store" } },
  );
}
