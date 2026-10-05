import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { MANIFEST_SCHEMA_VERSION, MANIFEST_FORMAT_VERSION } from '@navi/core'
import { validateNavigationArtifacts } from '@navi/compiler'
import { writePublishedMap, type PublishedMapRow } from '@/services/published-map-writer'
import { assertCampusMutationAllowed, requireVerifiedMutationAuth } from '@/lib/api-guard'
import {
  getPanoramaAssetStore,
  findPanoramaAssets,
  type PanoramaAssetRecord,
} from '@/lib/panorama-asset-store'
import { parsePanoramaKey } from '@/lib/panorama-keys'

const DEMO_DIR = join(process.cwd(), 'demo-output')

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRevision(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value)
  return null
}

function graphHasNodesOrEdges(value: unknown): boolean {
  if (!isRecord(value)) return false
  const graph = isRecord(value.graph)
    ? value.graph
    : isRecord(value.navigationGraph)
      ? value.navigationGraph
      : null
  if (!graph) return false
  return (
    (Array.isArray(graph.nodes) && graph.nodes.length > 0) ||
    (Array.isArray(graph.edges) && graph.edges.length > 0)
  )
}

function graphIsEmpty(value: unknown): boolean {
  if (!isRecord(value)) return false
  const graph = isRecord(value.navigationGraph) ? value.navigationGraph : null
  if (!graph) return false
  return (
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    graph.nodes.length === 0 &&
    graph.edges.length === 0
  )
}

interface PublishArtifactsPayload {
  navigationGraph?: Record<string, unknown>
  searchIndex?: unknown
  poiData?: unknown
  buildingIndex?: unknown
  spatialIndex?: unknown
  panoramaIndex?: unknown
  floorGeometry?: unknown
  qrIndex?: unknown
  traces?: unknown
  components?: unknown
  doors?: unknown
  metadata?: unknown
  [key: string]: unknown
}

interface PublishRequestBody {
  artifacts?: PublishArtifactsPayload
  campusId?: unknown
  revision?: unknown
  validationIssues?: unknown
  diagnostics?: unknown
}

interface PanoramaAssetFailure {
  panoramaId: string;
  code: string;
  message: string;
}

/** Panorama entries from the artifact that is about to be persisted. */
function panoramaEntriesFrom(panoramaIndex: unknown): Array<Record<string, unknown>> {
  if (!isRecord(panoramaIndex)) return [];
  const panoramas = panoramaIndex.panoramas;
  return Array.isArray(panoramas) ? panoramas.filter(isRecord) : [];
}

function panoramaLabels(entry: Record<string, unknown>): { id: string; title: string } {
  const id = typeof entry.id === 'string' && entry.id ? entry.id : '(unknown)';
  const title = typeof entry.title === 'string' && entry.title ? entry.title : id;
  return { id, title };
}

/**
 * Pass 1 — deterministic reference + identity validation (no I/O).
 *
 * Authoring may hold unfinished panoramas, but a published tour may not: an
 * empty reference, a non-canonical reference (legacy opaque value, literal or
 * data URL, malformed string), or a key whose campus/panorama identity does not
 * match this publication fails here, before any registry read.
 */
function collectPanoramaAssetChecks(
  panoramaIndex: unknown,
  campusId: string,
): { failures: PanoramaAssetFailure[]; keys: string[] } {
  const failures: PanoramaAssetFailure[] = [];
  const keys: string[] = [];

  for (const entry of panoramaEntriesFrom(panoramaIndex)) {
    const { id, title } = panoramaLabels(entry);
    const reference = entry.imageAssetId;

    if (typeof reference !== 'string' || reference.trim() === '') {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_MISSING_IMAGE',
        message:
          `panorama "${title}" has no panorama image asset — upload its image or ` +
          `remove the unfinished panorama before publishing`,
      });
      continue;
    }

    const parsed = parsePanoramaKey(reference);
    if (!parsed) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_INVALID_REFERENCE',
        message:
          `panorama "${title}" has an invalid panorama image reference — it must be a ` +
          `canonical R2 object key of the form panoramas/<campusId>/<panoramaId>.<jpg|png|webp>`,
      });
      continue;
    }

    if (parsed.campusId !== campusId) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_CAMPUS_MISMATCH',
        message:
          `panorama "${title}" references an image owned by campus "${parsed.campusId}", ` +
          `but this publication is for campus "${campusId}"`,
      });
      continue;
    }

    if (parsed.panoramaId !== id) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_PANORAMA_MISMATCH',
        message:
          `panorama "${title}" references image "${parsed.panoramaId}" — the image key must ` +
          `match the panorama id`,
      });
      continue;
    }

    keys.push(reference);
  }

  return { failures, keys };
}

/**
 * Pass 2 — registry validation against the single batch lookup result.
 *
 * A PanoramaEntry must find its own exact registry record; an absent key in a
 * partial batch result is a missing asset, not a pass.
 */
function checkPanoramaAssetRecords(
  panoramaIndex: unknown,
  campusId: string,
  records: Map<string, PanoramaAssetRecord>,
): PanoramaAssetFailure[] {
  const failures: PanoramaAssetFailure[] = [];

  for (const entry of panoramaEntriesFrom(panoramaIndex)) {
    const { id, title } = panoramaLabels(entry);
    const reference = entry.imageAssetId;
    if (typeof reference !== 'string') continue;
    if (!parsePanoramaKey(reference)) continue; // already reported by pass 1

    const record = records.get(reference);
    if (!record) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_NOT_REGISTERED',
        message:
          `panorama "${title}" has no registered image asset — upload the image through ` +
          `the panorama upload control so it is registered before publishing`,
      });
      continue;
    }
    if (record.status !== 'uploaded') {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_NOT_UPLOADED',
        message: `panorama "${title}" does not have a completed uploaded image`,
      });
      continue;
    }
    if (record.campusId !== campusId) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_REGISTRY_CAMPUS_MISMATCH',
        message:
          `panorama "${title}" image is registered to campus "${record.campusId}", ` +
          `but this publication is for campus "${campusId}"`,
      });
      continue;
    }
    if (record.panoramaId !== id) {
      failures.push({
        panoramaId: id,
        code: 'PANORAMA_ASSET_REGISTRY_PANORAMA_MISMATCH',
        message:
          `panorama "${title}" image is registered to panorama "${record.panoramaId}" — ` +
          `the image asset does not belong to this panorama`,
      });
      continue;
    }
  }

  return failures;
}

/**
 * Controlled publication failure for invalid panorama asset data. The Studio
 * caller surfaces `message` (and may not render diagnostics), so the message
 * carries the count and the first actionable detail; internals (SQL, keys of
 * the service role, signed URLs) are never included.
 */
function panoramaIntegrityFailure(failures: PanoramaAssetFailure[]) {
  const first = failures[0];
  const plural = failures.length === 1 ? '' : 's';
  return NextResponse.json(
    {
      success: false,
      status: 422,
      message:
        `Publication blocked: ${failures.length} panorama asset${plural} failed integrity ` +
        `validation. First affected panorama ${first.panoramaId}: ${first.message}`,
      diagnostics: failures.map(f => ({
        code: f.code,
        panoramaId: f.panoramaId,
        message: f.message,
      })),
    },
    { status: 422 },
  );
}

/**
 * Controlled response for a failure of the canonical durable publication write.
 *
 * The underlying database/transport detail is logged server-side only: the
 * client receives a stable, actionable message and never a driver error, a
 * constraint name, or a stack trace.
 */
function durablePublishFailure() {
  return NextResponse.json(
    {
      success: false,
      message:
        'Publication failed. No new version was published. Your existing live ' +
        'version, if any, was not changed. Please retry.',
    },
    { status: 503 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireVerifiedMutationAuth(request)
    if (unauthorized) return unauthorized

    const { artifacts, campusId, revision, validationIssues, diagnostics } =
      await request.json() as PublishRequestBody
    if (!artifacts || !artifacts.navigationGraph) {
      return NextResponse.json({ success: false, message: 'Missing artifacts' }, { status: 400 })
    }

    if (!campusId) {
      return NextResponse.json({ success: false, message: 'Missing campusId' }, { status: 400 })
    }

    // Validate campusId format (non-empty string)
    if (typeof campusId !== 'string' || campusId.trim() === '') {
      return NextResponse.json({ success: false, message: 'Invalid campusId: must be a non-empty string' }, { status: 400 })
    }

    const blocked = assertCampusMutationAllowed(campusId)
    if (blocked) return blocked

    // ── Atomic Publish Gate: reject if blocking validation issues exist ──
    const issues = validationIssues || diagnostics
    if (issues && Array.isArray(issues)) {
      const blocking = issues
        .filter(isRecord)
        .filter(issue => issue.severity === 'error')
      if (blocking.length > 0) {
        return NextResponse.json({
          success: false,
          status: 422,
          message: `Publish blocked: ${blocking.length} validation error(s) detected`,
          diagnostics: blocking,
        }, { status: 422 })
      }
    }


    const artifactMetadata = isRecord(artifacts.metadata) ? artifacts.metadata : {}
    const sourceRevisionRaw = artifactMetadata.sourceDocumentVersion ?? artifactMetadata.revision
    const sourceRevision = sourceRevisionRaw === undefined ? null : parseRevision(sourceRevisionRaw)
    if (sourceRevisionRaw !== undefined && sourceRevision === null) {
      return NextResponse.json({
        success: false,
        message: 'Invalid artifact source revision',
      }, { status: 400 })
    }

    const requestRevision = revision === undefined || revision === null
      ? sourceRevision ?? 1
      : parseRevision(revision)
    if (requestRevision === null) {
      return NextResponse.json({
        success: false,
        message: 'Invalid revision: must be a non-negative integer',
      }, { status: 400 })
    }
    if (sourceRevision !== null && requestRevision !== sourceRevision) {
      return NextResponse.json({
        success: false,
        message: 'Revision does not match compiler source provenance',
        sourceDocumentVersion: String(sourceRevision),
        revision: requestRevision,
      }, { status: 400 })
    }
    if (typeof artifactMetadata.campusId === 'string' && artifactMetadata.campusId !== campusId) {
      return NextResponse.json({
        success: false,
        message: 'Campus identity does not match compiler source provenance',
      }, { status: 400 })
    }

    // ── Phase 8B: validate the newly generated artifact before any write ──
    const artifactValidation = validateNavigationArtifacts({
      graph: artifacts.navigationGraph,
      buildingIndex: artifacts.buildingIndex,
      metadata: artifacts.metadata,
      components: artifacts.components,
      doors: artifacts.doors,
      floorGeometry: artifacts.floorGeometry,
      panoramaIndex: artifacts.panoramaIndex,
      qrIndex: artifacts.qrIndex,
    })
    if (!artifactValidation.valid) {
      return NextResponse.json({
        success: false,
        message: 'Publish blocked: ' + artifactValidation.errors.length + ' artifact validation error(s) detected',
        diagnostics: artifactValidation.errors,
        warnings: artifactValidation.warnings,
      }, { status: 422 })
    }

    // ── Panorama asset integrity gate (Phase 5B-B) ──
    // Runs AFTER auth/provenance/structural validation and BEFORE any durable
    // write, so an invalid panorama can never reach published_maps and the
    // previous published revision stays intact. Authoring may contain
    // unfinished panoramas; a published tour may not.
    const panoramaChecks = collectPanoramaAssetChecks(artifacts.panoramaIndex, campusId)
    if (panoramaChecks.failures.length > 0) {
      return panoramaIntegrityFailure(panoramaChecks.failures)
    }

    if (panoramaChecks.keys.length > 0) {
      const assetStore = getPanoramaAssetStore()
      if (!assetStore.ok) {
        // Fail closed: inability to verify required publication state is an
        // infrastructure failure, never a successful publish.
        return NextResponse.json(
          { success: false, message: 'Unable to verify panorama asset integrity before publication' },
          { status: 503 },
        )
      }

      let panoramaAssets: Map<string, PanoramaAssetRecord>
      try {
        // Exactly one batch read for all panoramas (never one query per entry).
        panoramaAssets = await findPanoramaAssets(assetStore.client, panoramaChecks.keys)
      } catch {
        return NextResponse.json(
          { success: false, message: 'Unable to verify panorama asset integrity before publication' },
          { status: 503 },
        )
      }

      const recordFailures = checkPanoramaAssetRecords(
        artifacts.panoramaIndex,
        campusId,
        panoramaAssets,
      )
      if (recordFailures.length > 0) {
        return panoramaIntegrityFailure(recordFailures)
      }
    }

    const compilerVersion = typeof artifactMetadata.compilerVersion === 'string' && artifactMetadata.compilerVersion.length > 0
      ? artifactMetadata.compilerVersion
      : typeof artifacts.navigationGraph?.version === 'string'
        ? artifacts.navigationGraph.version
        : '1.0.0'
    const compiledAt = typeof artifactMetadata.compiledAt === 'string' && artifactMetadata.compiledAt.length > 0
      ? artifactMetadata.compiledAt
      : typeof artifacts.navigationGraph?.createdAt === 'string'
        ? artifacts.navigationGraph.createdAt
        : new Date().toISOString()
    const artifactsBlob = {
      graph: artifacts.navigationGraph,
      searchIndex: artifacts.searchIndex ?? { version: '1.0.0', entries: [] },
      buildingIndex: artifacts.buildingIndex ?? { version: '1.0.0', buildings: [] },
      poiIndex: artifacts.poiData ?? { version: '1.0.0', points: [] },
      spatialIndex: artifacts.spatialIndex ?? null,
      panoramaIndex: artifacts.panoramaIndex ?? null,
      floorGeometry: artifacts.floorGeometry ?? null,
      qrIndex: artifacts.qrIndex ?? null,
      components: Array.isArray(artifacts.components) ? artifacts.components : [],
      doors: Array.isArray(artifacts.doors) ? artifacts.doors : [],
      ...(Array.isArray(artifacts.traces) ? { traces: artifacts.traces } : {}),
      metadata: {
        ...artifactMetadata,
        campusId,
        ...(typeof artifactMetadata.connectivitySemanticsVersion === 'string'
          ? { connectivitySemanticsVersion: artifactMetadata.connectivitySemanticsVersion }
          : {}),
        compilerVersion,
        revision: String(requestRevision),
        sourceDocumentVersion: String(sourceRevision ?? requestRevision),
        compiledAt,
      },
    }

    // ── 1. Write to Supabase published_maps (canonical durable store) ──
    // Phase 5C-B: publication success is defined SOLELY by this write. A
    // durable failure returns a controlled 503 BEFORE any non-authoritative
    // demo output is produced, so a failed publication can never be reported
    // as (or dressed up as) a success.
    const supabase = await getSupabaseClient()
    if (!supabase) {
      console.error('[publish] Supabase client unavailable; publication cannot be persisted')
      return durablePublishFailure()
    }

    if (graphIsEmpty(artifacts)) {
      const currentResult = await supabase
        .from('published_maps')
        .select('revision,artifacts')
        .eq('campus_id', campusId)
        .maybeSingle() as unknown as {
          data: { artifacts?: unknown } | null
          error: { message: string } | null
        }
      if (currentResult.error) {
        return NextResponse.json({
          success: false,
          message: 'Unable to verify the current publication before empty replacement',
        }, { status: 503 })
      }
      if (graphHasNodesOrEdges(currentResult.data?.artifacts)) {
        return NextResponse.json({
          success: false,
          message: 'Publish blocked: an empty artifact cannot replace a non-empty publication',
          diagnostics: [{
            code: 'ARTIFACT_EMPTY_GRAPH_REPLACEMENT',
            message: 'Normal Publish cannot clear an existing non-empty campus publication',
          }],
        }, { status: 422 })
      }
    }

    const row: PublishedMapRow = {
      campus_id: campusId,
      revision: requestRevision,
      compiler_version: compilerVersion,
      artifacts: artifactsBlob,
      published_at: new Date().toISOString(),
    }

    let publishWrite: Awaited<ReturnType<typeof writePublishedMap>>
    try {
      publishWrite = await writePublishedMap(supabase, row)
    } catch (error) {
      // Transport/exception failure. Log the internal detail server-side only.
      console.error('[publish] Supabase write threw:', (error as Error).message)
      return durablePublishFailure()
    }

    if (publishWrite.status === 'rejected') {
      // Revision conflict stays a distinct, non-infrastructure outcome.
      return NextResponse.json({
        success: false,
        message: 'Publish rejected: revision ' + requestRevision + ' is older than current revision ' + publishWrite.currentRevision,
        revision: requestRevision,
        currentRevision: publishWrite.currentRevision,
      }, { status: 409 })
    }

    if (publishWrite.status === 'error') {
      console.error('[publish] Supabase write failed:', publishWrite.message)
      return durablePublishFailure()
    }

    console.log('[publish] Published to Supabase: campus=' + campusId + ', revision=' + requestRevision)

    // Counts are pure derived scalars (Array.isArray + length) and cannot throw,
    // so they remain available to the client even when no demo output is produced.
    const publishedGraph = artifacts.navigationGraph ?? {}
    const publishedNodeCount = Array.isArray(publishedGraph.nodes) ? publishedGraph.nodes.length : 0
    const publishedEdgeCount = Array.isArray(publishedGraph.edges) ? publishedGraph.edges.length : 0

    // ── 2. Non-authoritative local/demo output ──
    // The canonical published_maps package is already committed, so publication
    // is successful. EVERY operation that exists only for local demo output is
    // inside this single best-effort boundary: payload construction,
    // serialization, manifest construction, checksums, directory creation and
    // file writes. No demo-only failure can turn a successful durable
    // publication into a reported failure. This boundary begins ONLY here, so
    // durable failures, revision conflicts, validation and panorama integrity
    // failures are never swallowed.
    let manifest: Record<string, unknown> | null = null
    try {
      const files: Record<string, string> = {
        'navigation.graph.json': JSON.stringify(artifacts.navigationGraph, null, 2),
        'search.index.json': JSON.stringify(artifacts.searchIndex ?? null, null, 2),
        'poi.json': JSON.stringify(artifacts.poiData ?? null, null, 2),
        'building-index.json': JSON.stringify(artifacts.buildingIndex ?? null, null, 2),
        'spatial-index.json': JSON.stringify(artifacts.spatialIndex ?? null, null, 2),
        'panorama-index.json': JSON.stringify(artifacts.panoramaIndex ?? null, null, 2),
        'floor-geometry.json': JSON.stringify(artifacts.floorGeometry ?? null, null, 2),
        'qr-index.json': JSON.stringify(artifacts.qrIndex ?? null, null, 2),
        'components.json': JSON.stringify(artifacts.components ?? [], null, 2),
        'doors.json': JSON.stringify(artifacts.doors ?? [], null, 2),
      }

      // Checksums computed from the exact bytes written to disk (see ERRORS.md 2026-07-08).
      manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        formatVersion: MANIFEST_FORMAT_VERSION,
        campusId: campusId,
        campusName: campusId,
        publishedAt: new Date().toISOString(),
        compilerVersion: compilerVersion,
        revision: String(requestRevision),
        artifacts: {
          graph: { path: 'navigation.graph.json', checksum: sha256(files['navigation.graph.json']), size: Buffer.byteLength(files['navigation.graph.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          search: { path: 'search.index.json', checksum: sha256(files['search.index.json']), size: Buffer.byteLength(files['search.index.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          poi: { path: 'poi.json', checksum: sha256(files['poi.json']), size: Buffer.byteLength(files['poi.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          buildings: { path: 'building-index.json', checksum: sha256(files['building-index.json']), size: Buffer.byteLength(files['building-index.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          spatial: { path: 'spatial-index.json', checksum: sha256(files['spatial-index.json']), size: Buffer.byteLength(files['spatial-index.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          panorama: { path: 'panorama-index.json', checksum: sha256(files['panorama-index.json']), size: Buffer.byteLength(files['panorama-index.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          floorGeometry: { path: 'floor-geometry.json', checksum: sha256(files['floor-geometry.json']), size: Buffer.byteLength(files['floor-geometry.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
          qrIndex: { path: 'qr-index.json', checksum: sha256(files['qr-index.json']), size: Buffer.byteLength(files['qr-index.json'], 'utf-8'), schemaVersion: '1.0.0', formatVersion: '0' },
        },
        metadata: {
          nodeCount: publishedNodeCount,
          edgeCount: publishedEdgeCount,
          buildingCount: 0,
          floorCount: 0,
          boundingBox: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
          routeable: true,
        },
      }

      if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true })
      for (const [filename, content] of Object.entries(files)) {
        writeFileSync(join(DEMO_DIR, filename), content)
      }
      writeFileSync(join(DEMO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
    } catch (error) {
      // Non-authoritative output only: the canonical published_maps package is
      // already committed, so a demo-output problem must not be reported as a
      // publication failure.
      console.warn('[publish] demo-output generation failed (non-authoritative):', (error as Error).message)
    }

    return NextResponse.json({
      success: true,
      supabase: 'written',
      ...(manifest ? { manifest } : {}),
      counts: {
        nodes: publishedNodeCount,
        edges: publishedEdgeCount,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
