/**
 * Server-only Cloudflare R2 (S3-compatible) helper.
 *
 * TEMPORARY: this exists solely to prove that the NAVI server can
 * authenticate against Cloudflare R2 and write one harmless object to the
 * private `navi-360` bucket. It is NOT the future 360 upload system — no
 * presigned URLs, no public access, no browser-side usage.
 *
 * Security contract:
 *  - Credentials are read from server-side `R2_*` environment variables only
 *    and are never echoed, logged, or serialized anywhere in this module.
 *  - Failure results carry variable *names*, an error *name*, an HTTP status
 *    and a request id — never an environment value, endpoint, or message body.
 *  - The bucket stays private: no ACL is ever set on the object.
 *  - `createR2Client` refuses to run in a browser runtime.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Environment variables required for R2 connectivity (names only, never values). */
export const R2_REQUIRED_ENV_VARS = [
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/** Cloudflare R2's documented default region. */
export const R2_DEFAULT_REGION = "auto";

/** Fixed, harmless object used by the connectivity test. */
export const R2_TEST_OBJECT_KEY = "_navi-tests/r2-connectivity-test.txt";
export const R2_TEST_OBJECT_BODY = "NAVI R2 connectivity test";

export interface R2Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type R2ConfigResult =
  | { ok: true; config: R2Config }
  | { ok: false; missing: string[] };

/**
 * Read and validate the R2 configuration. Missing/blank variables are
 * reported by NAME only so a configuration error can never leak a value.
 */
export function readR2Config(
  env: Record<string, string | undefined> = process.env,
): R2ConfigResult {
  const value = (name: string): string => (env[name] ?? "").trim();
  const missing = R2_REQUIRED_ENV_VARS.filter((name) => value(name) === "");

  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }

  return {
    ok: true,
    config: {
      endpoint: value("R2_ENDPOINT"),
      region: value("R2_REGION") || R2_DEFAULT_REGION,
      bucket: value("R2_BUCKET"),
      accessKeyId: value("R2_ACCESS_KEY_ID"),
      secretAccessKey: value("R2_SECRET_ACCESS_KEY"),
    },
  };
}

/** Build the S3-compatible client. Server runtimes only. */
export function createR2Client(config: R2Config): S3Client {
  if (typeof window !== "undefined") {
    throw new Error("R2 client must only be created in a server runtime.");
  }

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 is reached through a custom endpoint, so path-style addressing is used.
    forcePathStyle: true,
  });
}

/**
 * Reduce an SDK failure to fields that are safe to return over HTTP.
 * `message` is deliberately dropped: it can embed the endpoint, signing
 * material, or request details.
 */
export function sanitizeR2Error(error: unknown): {
  code: string;
  httpStatus?: number;
  requestId?: string;
} {
  const err = error as {
    name?: unknown;
    Code?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown; requestId?: unknown };
  };

  const name = [err?.name, err?.Code, err?.code].find(
    (candidate) => typeof candidate === "string" && candidate.length > 0,
  );

  const httpStatus = err?.$metadata?.httpStatusCode;
  const requestId = err?.$metadata?.requestId;

  return {
    code: typeof name === "string" ? name : "UnknownError",
    ...(typeof httpStatus === "number" ? { httpStatus } : {}),
    ...(typeof requestId === "string" ? { requestId } : {}),
  };
}

export type R2ConnectivityResult =
  | { ok: true; bucket: string; object: string }
  | { ok: false; stage: "configuration"; missing: string[] }
  | {
      ok: false;
      stage: "upload";
      error: { code: string; httpStatus?: number; requestId?: string };
    };

/**
 * Validate configuration, then upload exactly one fixed test object.
 * Returns a sanitized, serialization-safe result — never credentials.
 */
export async function runR2ConnectivityTest(
  env: Record<string, string | undefined> = process.env,
): Promise<R2ConnectivityResult> {
  const settings = readR2Config(env);
  if (!settings.ok) {
    return { ok: false, stage: "configuration", missing: settings.missing };
  }

  const { config } = settings;
  const client = createR2Client(config);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: R2_TEST_OBJECT_KEY,
        Body: R2_TEST_OBJECT_BODY,
        ContentType: "text/plain",
        // No ACL: the bucket and this object remain private.
      }),
    );

    return { ok: true, bucket: config.bucket, object: R2_TEST_OBJECT_KEY };
  } catch (error) {
    return { ok: false, stage: "upload", error: sanitizeR2Error(error) };
  }
}
