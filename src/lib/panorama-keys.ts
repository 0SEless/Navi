/**
 * Object-key convention for 360° panorama images in the private `navi-360`
 * bucket.
 *
 * Two canonical key shapes are READ by this module:
 *
 *     LEGACY     panoramas/<campusId>/<panoramaId>.<jpg|png|webp>
 *     IMMUTABLE  panoramas/<campusId>/<panoramaId>/<assetId>.<jpg|png|webp>
 *
 * New uploads use the IMMUTABLE shape with a server-generated UUID. Legacy
 * references remain readable so saved, published and recoverable documents
 * can continue to resolve their original images.
 *
 * Security contract:
 *  - Keys are ALWAYS generated server-side from validated ids; clients never
 *    choose, influence, or pass raw keys into a signer except through
 *    `isPanoramaKey`.
 *  - `isPanoramaKey` is the single admission gate for any externally supplied
 *    key (resolve/complete). It is anchored, lowercase, segment-bounded, and
 *    rejects traversal (`..`), separators, whitespace, control characters,
 *    and anything outside the panorama namespace — so a signed URL can never
 *    be minted for an object this module did not bless.
 *  - Depth is bounded at exactly two or three segments: a fourth path segment
 *    is never admitted, so the optional asset segment cannot be used to reach
 *    deeper into the bucket.
 *  - The optional asset segment obeys the SAME grammar as campusId/panoramaId.
 *    Keeping one grammar everywhere (and mirroring it in the database CHECK)
 *    is what stops the parser and the constraint from drifting apart.
 *  - Ids are restricted to `[a-z0-9][a-z0-9_-]{0,63}`: no dots, no slashes,
 *    no uppercase, no percent-encoding tricks.
 */

/** Content types accepted for panorama ingestion (exact match). */
export const PANORAMA_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PanoramaContentType = (typeof PANORAMA_ALLOWED_CONTENT_TYPES)[number];

/** Maximum panorama byte size accepted by the signer (25 MiB). */
export const PANORAMA_MAX_BYTES = 25 * 1024 * 1024;

/** Fixed namespace prefix for every panorama object. */
export const PANORAMA_KEY_PREFIX = "panoramas/";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/**
 * Canonical key grammar. The optional third segment is the immutable asset id.
 *
 * Kept byte-compatible with the `panorama_assets_key_format_check` CHECK in
 * supabase/migrations/016_panorama_assets_dual_format_key.sql (this source
 * escapes the solidus as `\/`, the SQL literal does not). The two MUST accept
 * and reject exactly the same key language — a key the parser admits but the
 * constraint rejects would fail at INSERT with a 500. Every segment quantifier
 * stays `{0,63}`, exactly as in `ID_PATTERN` and in migration 015: the
 * optional asset segment must not widen the campus/panorama grammar.
 */
const KEY_PATTERN =
  /^panoramas\/[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9_-]{0,63}(\/[a-z0-9][a-z0-9_-]{0,63})?\.(jpg|png|webp)$/;

/** Narrow a value to a valid campus/panorama id. */
export function isPanoramaId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Narrow a value to a key produced by `buildPanoramaKey`. */
export function isPanoramaKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Defense in depth: the pattern already forbids dots inside segments, but
  // traversal must be impossible even if the pattern is ever loosened.
  if (value.includes("..")) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  return KEY_PATTERN.test(value);
}

/** Which canonical key shape a reference uses. */
export type PanoramaKeyKind = "legacy" | "immutable";

/** A canonical panorama key decomposed into its identity parts. */
export interface ParsedPanoramaKey {
  campusId: string;
  panoramaId: string;
  /**
   * Immutable asset id, or `null` for a legacy key. Never confused with
   * `panoramaId`: the two occupy different path segments by construction.
   */
  assetId: string | null;
  extension: PanoramaContentType;
  kind: PanoramaKeyKind;
}

/**
 * Decompose a canonical panorama key into its identity parts.
 *
 * This is the ONLY place key identity is extracted: it delegates admission to
 * `isPanoramaKey` (so the grammar stays single-sourced in KEY_PATTERN) and
 * introduces no competing pattern. Pure and client-safe: no server, Supabase
 * or R2 imports. Returns `null` for anything that is not a canonical key —
 * literal URLs, legacy opaque values, traversal and malformed references all
 * fail admission here.
 *
 * `panoramaId` is ALWAYS path segment 2. For a legacy key that segment
 * carries the extension (`pano-1.jpg`) so the extension is stripped; for an
 * immutable key segment 2 is the bare panorama id and segment 3 carries the
 * asset id. Deriving the panorama id from the *filename stem* instead would
 * silently return the asset id for immutable keys, which would then fail the
 * publication gate's "key panorama id must match the panorama id" comparison.
 */
export function parsePanoramaKey(value: unknown): ParsedPanoramaKey | null {
  if (!isPanoramaKey(value)) return null;
  if (!value.startsWith(PANORAMA_KEY_PREFIX)) return null;
  const rest = value.slice(PANORAMA_KEY_PREFIX.length);
  // Exactly two segments (legacy) or three (immutable). Anything deeper is
  // already refused by KEY_PATTERN; this re-check keeps the invariant local.
  const segments = rest.split("/");
  if (segments.length !== 2 && segments.length !== 3) return null;
  const [campusId, panoramaSegment] = segments;
  if (!campusId) return null;
  if (!panoramaSegment) return null;
  const fileName = segments[segments.length - 1];
  if (!fileName) return null;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = fileName.slice(dot + 1);
  // Derive the accepted extensions from the single canonical content-type
  // list rather than introducing a second spelling of the allowed set.
  const allowedExtensions: readonly string[] = PANORAMA_ALLOWED_CONTENT_TYPES.map(
    (contentType) => extensionForContentType(contentType),
  );
  if (!allowedExtensions.includes(extension)) return null;
  const isImmutable = segments.length === 3;
  // Immutable: the asset id is the filename stem of segment 3, and segment 2
  // is already the bare panorama id.
  const assetId = isImmutable ? fileName.slice(0, dot) : null;
  const panoramaId = isImmutable ? panoramaSegment : panoramaSegment.slice(0, dot);
  if (!panoramaId) return null;
  if (assetId !== null && !assetId) return null;
  return {
    campusId,
    panoramaId,
    assetId,
    extension: extension as PanoramaContentType,
    kind: isImmutable ? "immutable" : "legacy",
  };
}

/** Map an accepted content type to its canonical lowercase extension. */
export function extensionForContentType(contentType: string): "jpg" | "png" | "webp" {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new TypeError(`Unsupported panorama content type: ${contentType}`);
  }
}

/**
 * Build a panorama key, with an immutable asset identity for new uploads.
 * Throws `TypeError` on any id or content type that fails validation — a
 * caller must never be able to produce a key outside the namespace.
 *
 * Omit assetId only when reconstructing a legacy reference. The signer always
 * supplies a fresh server-generated assetId.
 */
export function buildPanoramaKey(
  campusId: unknown,
  panoramaId: unknown,
  contentType: unknown,
  assetId?: unknown,
): string {
  if (!isPanoramaId(campusId)) {
    throw new TypeError("Invalid campusId for panorama key");
  }
  if (!isPanoramaId(panoramaId)) {
    throw new TypeError("Invalid panoramaId for panorama key");
  }
  if (typeof contentType !== "string") {
    throw new TypeError("Invalid contentType for panorama key");
  }
  const ext = extensionForContentType(contentType);
  if (assetId !== undefined && !isPanoramaId(assetId)) {
    throw new TypeError("Invalid assetId for panorama key");
  }
  const suffix = assetId === undefined ? '' : `/${assetId}`;
  const key = `${PANORAMA_KEY_PREFIX}${campusId}/${panoramaId}${suffix}.${ext}`;
  // Invariant: whatever we build must pass the admission gate.
  if (!isPanoramaKey(key)) {
    throw new TypeError("Built panorama key failed validation");
  }
  return key;
}
