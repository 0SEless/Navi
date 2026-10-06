/**
 * Tests for the temporary public-credential diagnostic.
 *
 * Two things matter here and both are about the privacy contract: the endpoint must be
 * admin-gated, and its body must be exactly one enum word with no credential material or
 * derivative in it. These tests assert the response BODY, not just a source, so a future
 * edit that widens the payload fails the suite rather than shipping a leak.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { publicCredentialSourceIndicator } from "@/lib/supabase-public";

const guardState = { denied: null as Response | null };

vi.mock("@/lib/api-guard", () => ({
  requireVerifiedMutationAuth: vi.fn(async () => guardState.denied),
}));

vi.mock("@/lib/supabase-public", () => ({
  publicCredentialSourceIndicator: vi.fn(),
}));

type RouteModule = typeof import("../route");

const PUBLISHABLE = "sb_publishable_fake-value-for-tests";

async function loadRoute(): Promise<RouteModule> {
  return (await import("../route")) as RouteModule;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  guardState.denied = null;
  vi.mocked(publicCredentialSourceIndicator).mockReturnValue("publishable");
});

describe("GET /api/diagnostics/public-credential-source", () => {
  it("returns exactly one enum word for an authorized caller", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicCredentialSource: "publishable" });
  });

  it("is not cached", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("propagates the guard's denial verbatim and never resolves a credential", async () => {
    const denial = new Response(JSON.stringify({ error: "Authentication required." }), { status: 401 });
    guardState.denied = denial;

    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));

    expect(response.status).toBe(401);
    expect(publicCredentialSourceIndicator).not.toHaveBeenCalled();
  });

  it("reports legacy when the resolver is on the anon fallback", async () => {
    vi.mocked(publicCredentialSourceIndicator).mockReturnValue("legacy");
    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));
    expect(await response.json()).toEqual({ publicCredentialSource: "legacy" });
  });

  it("reports missing when no public credential is configured", async () => {
    vi.mocked(publicCredentialSourceIndicator).mockReturnValue("missing");
    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));
    expect(await response.json()).toEqual({ publicCredentialSource: "missing" });
  });

  it("leaks no key material, prefix, length, or variable names in the body", async () => {
    const { GET } = await loadRoute();
    const response = await GET(new Request("https://navi.example/diagnostics"));
    const body = await response.text();

    // Exactly one property...
    expect(Object.keys(JSON.parse(body))).toEqual(["publicCredentialSource"]);
    // ...and nothing resembling a credential or its derivative.
    expect(body).not.toContain(PUBLISHABLE);
    expect(body).not.toContain("sb_publishable");
    expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(body).not.toContain("sb_secret");
    expect(body).not.toContain("NEXT_PUBLIC");
    expect(body).not.toContain("ANON");
    expect(body).not.toContain(/SUPABASE_(SECRET|SERVICE_ROLE)/);
  });

  it("carries a fixed, short, enumerable payload regardless of which key is configured", async () => {
    for (const indicator of ["publishable", "legacy", "missing"] as const) {
      vi.mocked(publicCredentialSourceIndicator).mockReturnValue(indicator);
      const { GET } = await loadRoute();
      const response = await GET(new Request("https://navi.example/diagnostics"));
      // Same body length for all three cases: the enum words are 10, 6 and 7 chars, so
      // assert the shape rather than a length constant.
      expect(Object.keys(await response.json())).toEqual(["publicCredentialSource"]);
    }
  });
});