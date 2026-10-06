/**
 * TEMPORARY read-only diagnostic: reports which PUBLIC Supabase credential a deployment
 * would select for browser / public-read / auth paths.
 *
 * Exists so an operator can confirm, with one admin-only call, that a deployment has moved
 * off the legacy JWT anon key onto the modern publishable key — the last check before the
 * legacy keys are disabled.
 *
 * Privacy contract (deliberately narrow):
 *   - Returns exactly ONE enum word: "publishable" | "legacy" | "missing".
 *   - Never returns key material or any derivative: no value, no prefix, no suffix, no
 *     length, no hash, no fingerprint, no encoding, not the environment variable names,
 *     not how many variables are set.
 *   - Never touches the privileged resolver, so it cannot reveal which privileged key is
 *     selected. `/api/diagnostics/credential-source` covers that separately.
 *
 * Authorization is unchanged from the privileged diagnostic: verified administrator
 * session required, fail-closed, DEV mock auth refused in production.
 */

import { NextResponse } from "next/server";
import { requireVerifiedMutationAuth } from "@/lib/api-guard";
import { publicCredentialSourceIndicator } from "@/lib/supabase-public";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireVerifiedMutationAuth(request);
  if (denied) return denied;

  // One enum word. Nothing else.
  return NextResponse.json(
    { publicCredentialSource: publicCredentialSourceIndicator() },
    { headers: { "cache-control": "no-store" } },
  );
}