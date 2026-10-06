/**
 * Tests for the FINAL public-credential contract.
 *
 * The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback has been removed, so these tests
 * assert a closed two-outcome contract: the publishable key is required, and nothing
 * else is accepted. The "does not accept the legacy key" cases are the important ones —
 * a silent fallback to a disabled credential tier is exactly the failure this whole
 * migration existed to prevent.
 *
 * Values here are deliberately fake literals. No test embeds, logs, or asserts on a real
 * credential.
 */

import { describe, expect, it } from "vitest";

import {
  SUPABASE_PUBLIC_KEY_VAR,
  assertNoPrivilegedSupabaseKeyInPublicVars,
  missingSupabasePublicKeyVars,
  resolveSupabasePublicKey,
  supabasePublicKeyOrUndefined,
} from "@/lib/supabase-public";

const PUBLISHABLE = "sb_publishable_fake-value-for-tests";
const LEGACY_ANON = "eyJfake.legacy.anon.jwt-for-tests";

describe("supabase-public: final contract selects the publishable key", () => {
  it("resolves the publishable key", () => {
    expect(resolveSupabasePublicKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toEqual({
      ok: true,
      key: PUBLISHABLE,
      source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    });
  });

  it("exposes exactly one supported variable name", () => {
    expect(SUPABASE_PUBLIC_KEY_VAR).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("trims surrounding whitespace", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${PUBLISHABLE}\n`,
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.key).toBe(PUBLISHABLE);
  });

  it("fails safely and names the missing variable when unset", () => {
    expect(resolveSupabasePublicKey({})).toEqual({
      ok: false,
      missing: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    });
  });

  it("fails safely on a blank publishable key", () => {
    expect(resolveSupabasePublicKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   " }).ok).toBe(false);
  });

  it("orUndefined returns undefined rather than throwing when unconfigured", () => {
    expect(supabasePublicKeyOrUndefined({})).toBeUndefined();
    expect(supabasePublicKeyOrUndefined({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBe(
      PUBLISHABLE,
    );
  });

  it("missingSupabasePublicKeyVars reports the name only, never a value", () => {
    expect(missingSupabasePublicKeyVars({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toEqual([]);
    expect(missingSupabasePublicKeyVars({})).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  });
});

describe("supabase-public: the legacy anon key is NOT accepted", () => {
  // The regression these guard: after the legacy JWT keys were disabled, a fallback to
  // NEXT_PUBLIC_SUPABASE_ANON_KEY would either break reads or, worse, mask a missing
  // publishable key behind a credential that no longer works.
  it("does not fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
    expect(resolveSupabasePublicKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON })).toEqual({
      ok: false,
      missing: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    });
    expect(supabasePublicKeyOrUndefined({ NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON })).toBeUndefined();
  });

  it("prefers publishable and ignores the legacy key even when both are present", () => {
    const resolution = resolveSupabasePublicKey({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.key).toBe(PUBLISHABLE);
      expect(resolution.key).not.toBe(LEGACY_ANON);
    }
  });

  it("reports missing when only the legacy anon key is configured", () => {
    // Same assertion as above via the resolution result; kept here to make the intent
    // explicit next to the legacy-key rejection it protects.
    expect(resolveSupabasePublicKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON }).ok).toBe(false);
  });
});

describe("supabase-public: never selects a privileged key", () => {
  // The single most important property of this module. If a call site could obtain a
  // secret key through the public resolver, that value would be inlined into the browser
  // bundle by Next.js — a credential leak.
  it("ignores SUPABASE_SECRET_KEY even when it is the only one set", () => {
    expect(resolveSupabasePublicKey({ SUPABASE_SECRET_KEY: "sb_secret_fake" }).ok).toBe(false);
    expect(supabasePublicKeyOrUndefined({ SUPABASE_SECRET_KEY: "sb_secret_fake" })).toBeUndefined();
  });

  it("reports missing rather than secret when only the privileged key is present", () => {
    expect(resolveSupabasePublicKey({ SUPABASE_SECRET_KEY: "sb_secret_fake" }).ok).toBe(false);
  });

  it("assertNoPrivilegedSupabaseKeyInPublicVars passes for a healthy config", () => {
    expect(() =>
      assertNoPrivilegedSupabaseKeyInPublicVars({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
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

describe("supabase-public: configuration errors disclose names only", () => {
  it("never includes a credential value in the missing-variable report", () => {
    const resolution = resolveSupabasePublicKey({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  ' })
    expect(resolution.ok).toBe(false)
    const serialised = JSON.stringify(resolution)
    expect(serialised).not.toContain(PUBLISHABLE)
    expect(serialised).not.toContain(LEGACY_ANON)
  })
})