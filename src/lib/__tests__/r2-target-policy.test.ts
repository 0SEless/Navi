import { afterEach, describe, expect, it, vi } from "vitest";
import {
  R2_DEVELOPMENT_BUCKET,
  R2_EXPECTED_ACCOUNT_ID_ENV_VAR,
  R2_PRODUCTION_BUCKET,
  createR2Client,
  readR2Config,
  type R2Config,
} from "../r2";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const OTHER_ACCOUNT_ID = "fedcba9876543210fedcba9876543210";
const credentials = {
  R2_ACCESS_KEY_ID: "synthetic-access-id",
  R2_SECRET_ACCESS_KEY: "synthetic-secret-value",
};

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    R2_ENDPOINT: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    R2_BUCKET: R2_DEVELOPMENT_BUCKET,
    ...credentials,
    NODE_ENV: "test",
    ...overrides,
  };
}

function config(overrides: Partial<R2Config> = {}): R2Config {
  return {
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    bucket: R2_DEVELOPMENT_BUCKET,
    accessKeyId: "synthetic-access-id",
    secretAccessKey: "synthetic-secret-value",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("R2 deployment target policy", () => {
  it("allows local Development configuration targeting only the Development bucket", () => {
    expect(readR2Config(env({ NODE_ENV: "development" })).ok).toBe(true);
  });

  it("rejects the Production bucket in Preview before any R2 client can be created", () => {
    const result = readR2Config(env({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      R2_BUCKET: R2_PRODUCTION_BUCKET,
      [R2_EXPECTED_ACCOUNT_ID_ENV_VAR]: ACCOUNT_ID,
    }));
    expect(result).toEqual({ ok: false, missing: ["R2_BUCKET"] });
    vi.stubGlobal("window", undefined);
    expect(() => createR2Client(config({ bucket: R2_PRODUCTION_BUCKET }), {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      [R2_EXPECTED_ACCOUNT_ID_ENV_VAR]: ACCOUNT_ID,
    })).toThrow(/not permitted/i);
  });

  it("requires a pinned Development account ID in Preview", () => {
    expect(readR2Config(env({ VERCEL_ENV: "preview", NODE_ENV: "production" }))).toEqual({
      ok: false,
      missing: [R2_EXPECTED_ACCOUNT_ID_ENV_VAR],
    });
  });

  it("rejects Preview endpoint account mismatch without revealing values", () => {
    const result = readR2Config(env({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      [R2_EXPECTED_ACCOUNT_ID_ENV_VAR]: OTHER_ACCOUNT_ID,
    }));
    expect(result).toEqual({ ok: false, missing: ["R2_ENDPOINT"] });
    expect(JSON.stringify(result)).not.toContain(ACCOUNT_ID);
    expect(JSON.stringify(result)).not.toContain(OTHER_ACCOUNT_ID);
  });

  it("allows Production only with the Production bucket and explicit account pin", () => {
    const production = env({
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      R2_BUCKET: R2_PRODUCTION_BUCKET,
      [R2_EXPECTED_ACCOUNT_ID_ENV_VAR]: ACCOUNT_ID,
    });
    expect(readR2Config(production).ok).toBe(true);
    expect(readR2Config({ ...production, R2_BUCKET: R2_DEVELOPMENT_BUCKET })).toMatchObject({
      ok: false,
      missing: ["R2_BUCKET"],
    });
  });

  it("rejects non-Cloudflare, non-HTTPS, or decorated endpoints", () => {
    for (const endpoint of [
      "https://storage.example.invalid",
      `http://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      `https://user@${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/path`,
    ]) {
      expect(readR2Config(env({ R2_ENDPOINT: endpoint }))).toMatchObject({
        ok: false,
        missing: ["R2_ENDPOINT"],
      });
    }
  });

  it("fails closed for unknown deployment environments", () => {
    expect(readR2Config(env({ NODE_ENV: "production" }))).toMatchObject({
      ok: false,
      missing: ["VERCEL_ENV"],
    });
    expect(readR2Config(env({ VERCEL_ENV: "custom" }))).toMatchObject({
      ok: false,
      missing: ["VERCEL_ENV"],
    });
  });
});
