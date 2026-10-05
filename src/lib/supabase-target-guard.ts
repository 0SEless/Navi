/**
 * Development-only Supabase write-target guard.
 *
 * ## Why this exists
 *
 * `next dev` loads `.env.development.local`. NAVI's write path
 * (`src/lib/graph-write-handler.ts`) connects with
 * `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. If that file
 * carries production credentials, an ordinary local autosave mutates the
 * production database — the service-role key bypasses RLS entirely.
 *
 * This previously happened: `.env.development.local` pointed at the
 * production project ref. `PROTECTED_CAMPUS_IDS` in `api-guard.ts` does not
 * help, because it protects a single campus id rather than the project.
 *
 * ## Contract
 *
 * - Only engages outside a production runtime, so production builds and
 *   production deployments are unaffected.
 * - Fails **closed** on positive evidence only. If the target cannot be
 *   positively identified as production, the request proceeds and fails
 *   later at the ordinary "no such function / unreachable" boundary. This
 *   keeps unit tests that never configure Supabase unaffected.
 * - Also rejects a *split* configuration (development URL paired with a
 *   production key), which is the failure mode of "just swap the URL".
 * - Contains no credentials. A Supabase project ref is a public identifier,
 *   not a secret, and only refs are ever compared or logged.
 */
import { NextResponse } from "next/server";

/**
 * The live production Supabase project. Ref only — this is a public
 * identifier, safe to log and to ship in source.
 */
export const PRODUCTION_SUPABASE_PROJECT_REF = "oltfaepqcktrumfhadzb";

/**
 * Optional comma-separated extension of the protected set, so additional
 * production-like projects can be fenced without a code change.
 */
export const PROTECTED_SUPABASE_REFS_VAR = "NAVI_PROTECTED_SUPABASE_REFS";

/**
 * True when this runtime is a real production deployment. Shared with
 * `api-guard.ts` so the mutation gate and the write-target guard can never
 * disagree about what "production" means.
 */
export function isProductionRuntimeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return (env.VERCEL_ENV ?? "").startsWith("production");
}

function protectedRefs(env: NodeJS.ProcessEnv): string[] {
  const extra = (env[PROTECTED_SUPABASE_REFS_VAR] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  return [...new Set([PRODUCTION_SUPABASE_PROJECT_REF, ...extra])];
}

/** Extract the project ref from a Supabase project URL. */
export function extractSupabaseProjectRef(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/^https:\/\/([a-z0-9]{15,25})\.supabase\.(?:co|in)\b/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract the project ref embedded in a Supabase key.
 *
 * Legacy `eyJ...` JWTs carry `{"ref": "..."}` in the payload and are decoded
 * here. The newer `sb_publishable_` / `sb_secret_` format is only honoured
 * when the ref segment is unambiguously delimited; otherwise `null` is
 * returned so the caller can never act on a guess.
 */
export function extractSupabaseKeyProjectRef(key: string | undefined | null): string | null {
  if (typeof key !== "string" || key === "") return null;

  if (key.startsWith("eyJ")) {
    try {
      const segment = key.split(".")[1];
      if (!segment) return null;
      const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
      const payload: unknown = JSON.parse(
        typeof atob === "function"
          ? atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
          : Buffer.from(padded, "base64").toString("utf8"),
      );
      const ref = (payload as { ref?: unknown } | null)?.ref;
      return typeof ref === "string" ? ref.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  for (const prefix of ["sb_publishable_", "sb_secret_"]) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.length >= 21 && rest[20] === "_" && /^[a-z0-9]{20}$/i.test(rest.slice(0, 20))) {
      return rest.slice(0, 20).toLowerCase();
    }
    return null;
  }

  return null;
}

export type SupabaseWriteTargetVerdict =
  | { ok: true }
  | { ok: false; code: "PRODUCTION_TARGET" | "CREDENTIAL_PROJECT_MISMATCH"; message: string; urlRef: string | null; keyRef: string | null };

/**
 * Decide whether a write may proceed against the configured Supabase project.
 * Pure and side-effect free so it can be unit-tested directly.
 */
export function evaluateSupabaseWriteTarget(env: NodeJS.ProcessEnv = process.env): SupabaseWriteTargetVerdict {
  // Production deployments legitimately write to production.
  if (isProductionRuntimeEnv(env)) return { ok: true };

  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL);
  const protectedSet = protectedRefs(env);

  if (urlRef && protectedSet.includes(urlRef)) {
    return {
      ok: false,
      code: "PRODUCTION_TARGET",
      urlRef,
      keyRef: null,
      message:
        `Refusing to write: this non-production runtime is configured against the protected Supabase project "${urlRef}". ` +
        `Set NEXT_PUBLIC_SUPABASE_URL and the matching keys in .env.development.local to your development project.`,
    };
  }

  // Split configuration: URL says development, credential says production.
  const keyRef =
    extractSupabaseKeyProjectRef(env.SUPABASE_SERVICE_ROLE_KEY) ??
    extractSupabaseKeyProjectRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (urlRef && keyRef && urlRef !== keyRef) {
    return {
      ok: false,
      code: "CREDENTIAL_PROJECT_MISMATCH",
      urlRef,
      keyRef,
      message:
        `Refusing to write: NEXT_PUBLIC_SUPABASE_URL targets "${urlRef}" but the configured Supabase key belongs to "${keyRef}". ` +
        `A development URL must not be paired with another project's key.`,
    };
  }

  return { ok: true };
}

/**
 * The single shared assertion used by the write path.
 * Returns `null` when the write may proceed, or the response to return as-is.
 */
export function assertSafeSupabaseWriteTarget(env: NodeJS.ProcessEnv = process.env): NextResponse | null {
  const verdict = evaluateSupabaseWriteTarget(env);
  if (verdict.ok) return null;
  console.error(
    `[supabase-target-guard] blocked ${verdict.code} urlRef=${verdict.urlRef ?? "unknown"} keyRef=${verdict.keyRef ?? "unknown"}`,
  );
  return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
}