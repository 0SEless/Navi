import { NextResponse } from "next/server";
import {
  evaluateSupabaseWriteTarget as evaluatePolicy,
  resolveDeploymentEnvironment,
} from "@/lib/supabase-write-policy";
import type { SupabaseWriteTargetVerdict, WriteTargetEnvironment } from "@/lib/supabase-write-policy";

export {
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PROTECTED_SUPABASE_REFS_VAR,
  extractSupabaseKeyProjectRef,
  extractSupabaseProjectRef,
} from "@/lib/supabase-write-policy";
export type { SupabaseWriteTargetVerdict } from "@/lib/supabase-write-policy";

/** True only for an explicitly identified Vercel Production deployment. */
export function isProductionRuntimeEnv(env: WriteTargetEnvironment = process.env): boolean {
  return resolveDeploymentEnvironment(env) === "production";
}

/** Pure policy wrapper retained for existing server-side callers. */
export function evaluateSupabaseWriteTarget(env: WriteTargetEnvironment = process.env): SupabaseWriteTargetVerdict {
  return evaluatePolicy(env);
}

/** Returns null when a write is safe, otherwise a sanitized 409 response. */
export function assertSafeSupabaseWriteTarget(env: WriteTargetEnvironment = process.env): NextResponse | null {
  const verdict = evaluatePolicy(env);
  if (verdict.ok) return null;
  console.error(
    `[supabase-target-guard] blocked ${verdict.code} urlRef=${verdict.urlRef ?? "unknown"} keyRef=${verdict.keyRef ?? "unknown"}`,
  );
  return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
}
