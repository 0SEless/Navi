import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  requireVerifiedMutationAuth,
} from "@/lib/api-guard";
import {
  privilegedCredentialSourceIndicator,
  supabaseSecretKeyOrUndefined,
} from "@/lib/supabase-privileged";

/**
 * READ-ONLY privileged-credential diagnostics.
 *
 * Answers two operator questions with one call:
 *
 *   { "source": "secret", "supabaseRead": "success", "rowCount": 0 }
 *
 *   source       which privileged credential source the resolver selects:
 *                "secret" | "legacy" | "missing"
 *   supabaseRead whether a privileged client built through the SAME resolver path used by
 *                production code can actually authenticate and query Supabase:
 *                "success" | "failure"
 *   rowCount     how many rows the read-only probe could see (integer)
 *
 * SAFETY PROPERTIES (all deliberate):
 *   - It performs NO write, NO insert, NO update, NO delete, and NO upload. It issues exactly
 *     one Supabase read.
 *   - The probe uses `head: true`, so PostgREST answers with a COUNT and no row bodies. No
 *     database row contents are ever transferred into this process, let alone into a
 *     response. A zero-row table is a SUCCESS, not a failure.
 *   - The credential indicator is a closed three-value enum: no key material and no
 *     derivative of it — not the value, not its length, not a hash or fingerprint, not a
 *     prefix, not the environment variable names, not how many are set.
 *   - The privileged client is constructed exactly as the production consumers construct it
 *     (cookie-less `createServerClient` with the resolver's key), so this genuinely
 *     exercises the deployed path rather than a parallel one.
 *   - On failure only a Sanitized Supabase `code` and truncated `message` are returned — no
 *     `hint`, no `details`, no row data, no environment contents.
 *   - Gated by `requireVerifiedMutationAuth`, which fails closed: 401 without a session, 403
 *     for a verified non-admin, cryptographically verified Supabase session required, and
 *     DEV mock auth refused in production. Responds with `cache-control: no-store`.
 *
 * Operational note: this exists to confirm the Secret API key migration before the legacy
 * credential is deactivated. It is intentionally short-lived and admin-only; remove it once
 * the migration is verified.
 */
export const dynamic = "force-dynamic";

const PANORAMA_ASSET_TABLE = "panorama_assets";

/** Sanitized failure detail: Supabase code plus a bounded message. Never hint/details. */
function sanitizeSupabaseError(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return null;
  return {
    code: typeof error.code === "string" ? error.code.slice(0, 64) : null,
    message: typeof error.message === "string" ? error.message.slice(0, 200) : null,
  };
}

/**
 * Minimal read-only reachability probe through the production privileged-client path.
 *
 * Exported for unit testing. Returns only a status word, a row count, and — on failure —
 * sanitized error detail. Never returns row contents.
 */
export async function probePrivilegedRead(): Promise<{
  supabaseRead: "success" | "failure";
  rowCount: number;
  error: ReturnType<typeof sanitizeSupabaseError>;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseSecretKeyOrUndefined();

  // Mirror the production consumers: cookie-less privileged client built from the resolver.
  if (!url || !key) {
    return {
      supabaseRead: "failure",
      rowCount: 0,
      error: { code: "CONFIG_MISSING", message: "Privileged Supabase configuration is incomplete." },
    };
  }

  try {
    const client = createServerClient(url, key, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    // head:true => PostgREST returns a COUNT with no row bodies. Proves SELECT permission
    // without transferring any row content.
    const { count, error } = await client
      .from(PANORAMA_ASSET_TABLE)
      .select("key", { head: true, count: "exact" });

    if (error) {
      return { supabaseRead: "failure", rowCount: 0, error: sanitizeSupabaseError(error) };
    }
    return { supabaseRead: "success", rowCount: typeof count === "number" ? count : 0, error: null };
  } catch (e) {
    return {
      supabaseRead: "failure",
      rowCount: 0,
      error: { code: "PROBE_EXCEPTION", message: String((e as Error)?.message ?? e).slice(0, 200) },
    };
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireVerifiedMutationAuth(request);
  if (unauthorized) return unauthorized;

  const source = privilegedCredentialSourceIndicator();

  // Only probe when a credential is actually selected; a "missing" source has nothing to
  // authenticate with, and reporting "failure" there would be misleading.
  if (source === "missing") {
    return NextResponse.json(
      { source, supabaseRead: "skipped", rowCount: 0 },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const probe = await probePrivilegedRead();
  return NextResponse.json(
    { source, supabaseRead: probe.supabaseRead, rowCount: probe.rowCount, ...(probe.error ? { error: probe.error } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
