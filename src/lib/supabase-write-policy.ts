/**
 * Pure Supabase write-target policy shared by server mutations and browser
 * Storage writes. Vercel Preview is a production-mode Next.js build, so the
 * Vercel deployment environment takes precedence over NODE_ENV.
 */
export const PRODUCTION_SUPABASE_PROJECT_REF = "oltfaepqcktrumfhadzb";
export const DEVELOPMENT_SUPABASE_PROJECT_REF = "scvgulusmutnzasmgysx";
export const PROTECTED_SUPABASE_REFS_VAR = "NAVI_PROTECTED_SUPABASE_REFS";
export const PUBLIC_DEPLOYMENT_ENV_VAR = "NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV";

export type WriteTargetEnvironment = Readonly<Record<string, string | undefined>>;
export type DeploymentEnvironment = "production" | "preview" | "development" | "local" | "test" | "unknown";

export type SupabaseWriteTargetVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "PRODUCTION_TARGET" | "CREDENTIAL_PROJECT_MISMATCH" | "UNVERIFIED_TARGET";
      message: string;
      urlRef: string | null;
      keyRef: string | null;
    };

function normalizeDeployment(value: string | undefined): DeploymentEnvironment | null {
  switch (value?.trim().toLowerCase()) {
    case "production": return "production";
    case "preview": return "preview";
    case "development": return "development";
    case "local": return "local";
    case "test": return "test";
    default: return value ? "unknown" : null;
  }
}

/** Resolve Vercel's actual deployment target before the Next.js NODE_ENV. */
export function resolveDeploymentEnvironment(env: WriteTargetEnvironment): DeploymentEnvironment {
  const vercel = normalizeDeployment(env.VERCEL_ENV);
  if (vercel) return vercel;

  const publicMarker = normalizeDeployment(env[PUBLIC_DEPLOYMENT_ENV_VAR]);
  if (publicMarker) return publicMarker;

  if (env.NODE_ENV === "test") return "test";
  return "unknown";
}

/** Extract the project ref from an HTTPS Supabase project URL. */
export function extractSupabaseProjectRef(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/^https:\/\/([a-z0-9]{15,25})\.supabase\.(?:co|in)\b/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract a project ref from a legacy JWT. Modern sb_secret/sb_publishable
 * keys are opaque, project-generated strings and do not contain the project
 * ref, so their suffix must never be interpreted as one.
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

  return null;
}

function denied(
  code: Extract<SupabaseWriteTargetVerdict, { ok: false }>["code"],
  message: string,
  urlRef: string | null,
  keyRef: string | null,
): SupabaseWriteTargetVerdict {
  return { ok: false, code, message, urlRef, keyRef };
}

/**
 * Allow only the approved project for the current deployment class:
 * - Vercel Production -> Production Supabase.
 * - Preview, Development, or local runtime -> Development Supabase only.
 * - Unidentified deployment -> fail closed.
 * The test runner is explicitly exempt so route doubles remain isolated.
 */
export function evaluateSupabaseWriteTarget(env: WriteTargetEnvironment): SupabaseWriteTargetVerdict {
  const deployment = resolveDeploymentEnvironment(env);
  if (deployment === "test") return { ok: true };

  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL);
  const keyRef =
    extractSupabaseKeyProjectRef(env.SUPABASE_SECRET_KEY) ??
    extractSupabaseKeyProjectRef(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (deployment === "unknown") {
    return denied(
      "UNVERIFIED_TARGET",
      "Refusing to write because the deployment environment could not be identified.",
      urlRef,
      keyRef,
    );
  }

  const isProduction = deployment === "production";
  const expectedRef = isProduction
    ? PRODUCTION_SUPABASE_PROJECT_REF
    : DEVELOPMENT_SUPABASE_PROJECT_REF;

  if (!urlRef || urlRef !== expectedRef) {
    const isProductionRefInNonProduction = !isProduction && urlRef === PRODUCTION_SUPABASE_PROJECT_REF;
    return denied(
      isProductionRefInNonProduction ? "PRODUCTION_TARGET" : "UNVERIFIED_TARGET",
      isProductionRefInNonProduction
        ? `Refusing to write: non-production runtime targets the protected Production Supabase project "${urlRef}".`
        : `Refusing to write: this ${isProduction ? "Production" : "non-production"} runtime must target its approved Supabase project.`,
      urlRef,
      keyRef,
    );
  }

  const extraProtectedRefs = (env[PROTECTED_SUPABASE_REFS_VAR] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!isProduction && extraProtectedRefs.includes(urlRef)) {
    return denied(
      "PRODUCTION_TARGET",
      `Refusing to write: non-production runtime targets protected Supabase project "${urlRef}".`,
      urlRef,
      keyRef,
    );
  }

  if (keyRef && keyRef !== expectedRef) {
    return denied(
      "CREDENTIAL_PROJECT_MISMATCH",
      `Refusing to write: the configured Supabase key does not belong to the approved project "${urlRef}".`,
      urlRef,
      keyRef,
    );
  }

  return { ok: true };
}
