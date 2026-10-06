/**
 * Public-credential resolution tests.
 *
 * Mirrors `supabase-privileged.test.ts`, which proves the privileged resolver never
 * selects a public key. Together the two suites pin the credential split in both
 * directions:
 *
 *   public resolver  -> publishable (fallback legacy anon), NEVER a privileged key
 *   privileged resolver -> secret (fallback legacy service_role), NEVER a public key
 *
 * Values in these fixtures are deliberately fake literals. No test asserts on, logs, or
 * embeds a real credential, and no test compares against a real value's shape beyond
 * "is this the string I passed in", which is necessary to prove selection.
 */

import { describe, expect, it } from "vitest";

import {
  SUPABASE_PUBLIC_KEY_VARS,
  assertNoPrivilegedSupabaseKeyInPublicVars,
  missingSupabasePublicKeyVars,
  publicCredentialSourceIndicator,
  resolveSupabasePublicKey,
  supabasePublicKeyOrUndefined,
} from "@/lib/supabase-public";
import {
  privilegedCredentialSourceIndicator,
  resolveSupabaseSecretKey,
} from "@/lib/supabase-privileged";

const PUBLISHABLE = "sb_publishable_fake-value-for-tests";
const LEGACY_ANON = "eyJfake.legacy.anon.jwt-for-tests";

describe("supabase-public: selection order", () => {
  it("prefers the modern publishable key when both are configured", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    });
    expect(resolution).toEqual({
      ok: true,
      key: PUBLISHABLE,
      source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    });
  });

  it("falls back to the legacy anon key only when the publishable key is absent", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    });
    expect(resolution).toEqual({
      ok: true,
      key: LEGACY_ANON,
      source: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    });
  });

  it("treats a blank publishable key as absent so the fallback still works", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.source).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(resolution.key).toBe(LEGACY_ANON);
    }
  });

  it("trims surrounding whitespace from the resolved key", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${PUBLISHABLE}\n`,
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.key).toBe(PUBLISHABLE);
  });

  it("fails safely and names every missing variable when neither is configured", () => {
    const resolution = resolveSupabasePublicKey({});
    expect(resolution).toEqual({
      ok: false,
      missing: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    });
  });

  it("orUndefined returns undefined rather than throwing when unconfigured", () => {
    expect(supabasePublicKeyOrUndefined({})).toBeUndefined();
    expect(supabasePublicKeyOrUndefined({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBe(
      PUBLISHABLE,
    );
  });

  it("missingSupabasePublicKeyVars reports names only, never values", () => {
    expect(
      missingSupabasePublicKeyVars({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
      }),
    ).toEqual([]);
    expect(missingSupabasePublicKeyVars({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });
});

describe("supabase-public: never selects a privileged key", () => {
  // The single most important property of this module. If a call site could obtain a
  // secret key through the public resolver, that value would be inlined into the browser
  // bundle by Next.js — a credential leak.
  it("ignores privileged variables even when they are the only ones set", () => {
    const resolution = resolveSupabasePublicKey({
      SUPABASE_SECRET_KEY: "sb_secret_fake-should-never-be-returned",
      SUPABASE_SERVICE_ROLE_KEY: LEGACY_ANON,
    });
    expect(resolution.ok).toBe(false);
    expect(supabasePublicKeyOrUndefined({
      SUPABASE_SECRET_KEY: "sb_secret_fake-should-never-be-returned",
      SUPABASE_SERVICE_ROLE_KEY: LEGACY_ANON,
    })).toBeUndefined();
  });

  it("prefers the publishable key even when a secret key is also present", () => {
    const resolution = resolveSupabasePublicKey({
      SUPABASE_SECRET_KEY: "sb_secret_fake-should-never-be-returned",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.key).toBe(PUBLISHABLE);
  });

  it("only ever reads the two NEXT_PUBLIC public variables", () => {
    // Guards the ordering list itself against a future privileged entry.
    expect([...SUPABASE_PUBLIC_KEY_VARS]).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("assertNoPrivilegedSupabaseKeyInPublicVars passes for a healthy config", () => {
    expect(() =>
      assertNoPrivilegedSupabaseKeyInPublicVars({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
      }),
    ).not.toThrow();
  });

  it("assertNoPrivilegedSupabaseKeyInPublicVars fails closed on a NEXT_PUBLIC_* secret alias", () => {
    expect(() =>
      assertNoPrivilegedSupabaseKeyInPublicVars({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: "sb_secret_fake",
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
  });

  it("the leaked-alias error names the variable but not its value", () => {
    let message = "";
    try {
      assertNoPrivilegedSupabaseKeyInPublicVars({
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "super-secret-value-do-not-print",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(message).not.toContain("super-secret-value-do-not-print");
  });
});

describe("migration safety: privileged resolver is unchanged and stays privileged", () => {
  // Requirement 5: this migration must not have altered the privileged resolver in any
  // way. These assertions pin the pre-existing selection order and prove the public
  // migration did not widen it to consume publishable/anon variables.
  it("still prefers SUPABASE_SECRET_KEY over the legacy service_role key", () => {
    expect(
      resolveSupabaseSecretKey({
        SUPABASE_SECRET_KEY: "sb_secret_fake",
        SUPABASE_SERVICE_ROLE_KEY: LEGACY_ANON,
      }),
    ).toEqual({ ok: true, key: "sb_secret_fake", source: "SUPABASE_SECRET_KEY" });
  });

  it("still falls back to the legacy service_role key", () => {
    expect(resolveSupabaseSecretKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_ANON })).toEqual({
      ok: true,
      key: LEGACY_ANON,
      source: "SUPABASE_SERVICE_ROLE_KEY",
    });
  });

  it("never selects a public publishable key for privileged access", () => {
    // Even when the publishable key is the only modern credential present, the privileged
    // resolver must not fall back to it. It reports missing instead.
    expect(
      resolveSupabaseSecretKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }),
    ).toEqual({ ok: false, missing: ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] });
  });

  it("reports the privileged source as secret when only the secret key is configured", () => {
    expect(
      privilegedCredentialSourceIndicator({
        SUPABASE_SECRET_KEY: "sb_secret_fake",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }),
    ).toBe("secret");
  });
});

describe("supabase-public: closed source indicator", () => {
  it("reports publishable when the modern variable is configured", () => {
    expect(
      publicCredentialSourceIndicator({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
      }),
    ).toBe("publishable");
  });

  it("reports legacy when only the anon fallback is configured", () => {
    expect(publicCredentialSourceIndicator({ NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON })).toBe(
      "legacy",
    );
  });

  it("reports missing when neither is configured", () => {
    expect(publicCredentialSourceIndicator({})).toBe("missing");
  });

  it("never reports privileged keys as the public source", () => {
    expect(
      publicCredentialSourceIndicator({
        SUPABASE_SECRET_KEY: "sb_secret_fake",
        SUPABASE_SERVICE_ROLE_KEY: LEGACY_ANON,
      }),
    ).toBe("missing");
  });

  it("returns exactly one of three words and never any key material", () => {
    // Guards against a future change widening the indicator's return type.
    const result = publicCredentialSourceIndicator({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    });
    expect(["publishable", "legacy", "missing"]).toContain(result);
    expect(typeof result).toBe("string");
    expect(result).not.toContain(PUBLISHABLE);
    expect(result).not.toContain("sb_publishable");
  });
});