import { isPanoramaKey } from "./panorama-keys";

/**
 * Phase 3B runtime boundary: durable panorama image reference -> renderable URL.
 *
 * The durable NAVI contract is `Panorama.imageAssetId = R2 object key`
 * (e.g. `panoramas/<campusId>/<panoramaId>.jpg`). The private bucket only
 * hands out short-lived presigned GET URLs, so a viewer must exchange the
 * key through `GET /api/panorama-resolve?key=...` immediately before render.
 *
 * The returned URL is EPHEMERAL (300s TTL) and must never be persisted into
 * any durable layer (document, snapshot, panoramaIndex, store, cache).
 *
 * Compatibility rule (TEMPORARY, Phase 3B only): values that are not valid
 * panorama R2 keys - legacy opaque ids, literal URLs used by demo/sandbox
 * callers of TourViewer - are returned UNCHANGED without calling the API.
 * This keeps existing non-R2 callers working and must NOT be read as a
 * change to the canonical durable contract, which remains "imageAssetId is
 * an R2 key". Empty strings pass through untouched as well (the public
 * production path already filters empty panoramas upstream).
 *
 * Client-safe: this module may only import client-safe dependencies
 * (panorama-keys.ts is a pure validation module with zero imports).
 */

const RESOLVE_FAILED_MESSAGE = "Could not load this panorama image.";

/** Exchange a durable R2 panorama key for a temporary presigned GET URL. */
export async function resolvePanoramaImageUrl(imageRef: string): Promise<string> {
  if (!imageRef || !isPanoramaKey(imageRef)) return imageRef;

  let response: Response;
  try {
    response = await fetch(
      `/api/panorama-resolve?key=${encodeURIComponent(imageRef)}`,
    );
  } catch {
    // Network-level failure: controlled message, no internal details.
    throw new Error(RESOLVE_FAILED_MESSAGE);
  }

  if (!response.ok) throw new Error(RESOLVE_FAILED_MESSAGE);

  let body: { ok?: unknown; url?: unknown };
  try {
    body = (await response.json()) as { ok?: unknown; url?: unknown };
  } catch {
    throw new Error(RESOLVE_FAILED_MESSAGE);
  }

  if (body.ok !== true || typeof body.url !== "string" || !body.url) {
    throw new Error(RESOLVE_FAILED_MESSAGE);
  }
  return body.url;
}
