// POST /api/studio/v2/publish (spec section 10): publish a SAVED commit, or roll the
// public map back to an earlier publication.
//
//   { campusId, commitNo }    compile the parts at commitNo and record a publication
//   { campusId, rollbackTo }  point the campus at an earlier publication number
//
// Publishing compiles on the server exactly as /api/compile does, validates the output
// exactly as the legacy /api/publish does, and stores the same blob shape the legacy
// route writes to published_maps (buildArtifactsBlob), so NAVI Web reads it unchanged.
// It never writes demo-output files and never touches published_maps.
//
// Order: auth -> body -> protected-campus gate (R35, as legacy /api/publish) -> role
// pre-check (R36: owner or super_admin, before any compile work; the SQL functions
// check again) -> parts at the commit -> join -> route-network hard gate (R33, as
// PublishService) -> compile -> validate -> record.
// Nothing here logs artifacts, part contents or request bodies.
import { CampusCompiler, validateNavigationArtifacts } from '@navi/compiler'
import { buildSiteArtifact, type CampusDocument } from '@navi/core'
// Imported from its own module, never the @navi/editor root or the validation barrel:
// those re-export React context/hooks (createContext) that break the server route layer.
// route-network.ts imports only @navi/core at runtime (plus type-only imports).
import { validateRouteNetwork } from '@navi/editor/src/validation/rules/modules/route-network'
import { assertCampusMutationAllowed } from '../../lib/api-guard'
import { canonicalJson, sha256Hex } from '../parts/canonical'
import { joinParts } from '../parts/join'
import { parsePartKey } from '../parts/part-keys'
import type { PartRecord } from '../parts/split'
import { buildArtifactsBlob, type PublishArtifactsPayload } from './artifacts-blob'
import { fail, isRecord, json, readBody, requireCampusId, runGuarded, type Actor, type StudioHandlerDeps } from './handlers'
import type { PartRecordWithVersion } from './types'

type AnyRecord = Record<string, unknown>

export type PublishHandlerDeps = StudioHandlerDeps

function requirePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    fail(400, 'INVALID_REQUEST', { message: `${name} must be a positive integer.` })
  }
  return value
}

/** Binary parts (terrain tiles) have no place in a 1.5 document; refuse rather than drop them. */
function unsupportedParts(parts: PartRecordWithVersion[]): string[] {
  return parts
    .filter((part) => {
      let isTile = false
      try {
        isTile = parsePartKey(part.partKey).kind === 'terrain-tile'
      } catch {
        return false
      }
      const binary = part.contentBase64 !== null && part.contentBase64 !== undefined
      // Terrain tiles are the only binary parts; they are joined into the document (terrain plan).
      return isTile ? !binary : binary
    })
    .map((part) => part.partKey)
}

/** The artifacts exactly as /api/compile assembles them, as they arrive after its JSON response. */
function compileRouteArtifacts(result: ReturnType<CampusCompiler['compileV2']>): PublishArtifactsPayload {
  const compiledArtifacts = result.artifacts ?? {}
  return JSON.parse(
    JSON.stringify({
      ...compiledArtifacts,
      navigationGraph: result.graph,
      searchIndex: result.artifacts?.searchIndex ?? null,
      poiData: result.artifacts?.poiIndex ?? null,
      buildingIndex: result.artifacts?.buildingIndex ?? null,
      spatialIndex: result.artifacts?.spatialIndex ?? null,
      panoramaIndex: result.artifacts?.panoramaIndex ?? null,
      floorGeometry: result.artifacts?.floorGeometry ?? null,
      qrIndex: result.artifacts?.qrIndex ?? null,
      components: result.artifacts?.components ?? [],
      doors: result.artifacts?.doors ?? [],
      metadata: result.artifacts?.metadata ?? null,
    }),
  ) as PublishArtifactsPayload
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Same test as the legacy publish route's graphIsEmpty / graphHasNodesOrEdges. */
function graphIsEmpty(artifacts: PublishArtifactsPayload): boolean {
  const graph = isRecord(artifacts.navigationGraph) ? artifacts.navigationGraph : null
  if (!graph) return false
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges) && graph.nodes.length === 0 && graph.edges.length === 0
}

function graphHasNodesOrEdges(artifacts: unknown): boolean {
  if (!isRecord(artifacts)) return false
  const graph = isRecord(artifacts.graph) ? artifacts.graph : isRecord(artifacts.navigationGraph) ? artifacts.navigationGraph : null
  if (!graph) return false
  return (Array.isArray(graph.nodes) && graph.nodes.length > 0) || (Array.isArray(graph.edges) && graph.edges.length > 0)
}

export function createPublishHandlers(deps: PublishHandlerDeps) {
  const { repo, verifyPrincipal } = deps

  /** R36: owner or super_admin, checked before any work. Null when allowed, else the response. */
  async function roleRefusal(campusId: string, actor: Actor): Promise<Response | null> {
    if (actor.isSuperAdmin) return null
    const role = await repo.roleOf(campusId, actor.id)
    if (role === null) return json(404, { code: 'CAMPUS_NOT_FOUND' })
    if (role !== 'owner') return json(403, { code: 'FORBIDDEN' })
    return null
  }

  return {
    // POST /api/studio/v2/publish
    publish(request: Request): Promise<Response> {
      return runGuarded(verifyPrincipal, 'publish', request, async (actor) => {
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        const hasCommit = body.commitNo !== undefined
        const hasRollback = body.rollbackTo !== undefined
        if (hasCommit === hasRollback) {
          fail(400, 'INVALID_REQUEST', { message: 'Send exactly one of commitNo or rollbackTo.' })
        }
        const publicationNo = hasRollback ? requirePositiveInteger(body.rollbackTo, 'rollbackTo') : 0
        const commitNo = hasCommit ? requirePositiveInteger(body.commitNo, 'commitNo') : 0

        // R35: the legacy protected-campus gate, returned as-is (423).
        const blocked = assertCampusMutationAllowed(campusId)
        if (blocked) return blocked

        const refused = await roleRefusal(campusId, actor)
        if (refused) return refused

        // ── Rollback ──
        if (hasRollback) {
          const result = await repo.rollbackPublication(campusId, publicationNo, actor.id, actor.isSuperAdmin)
          switch (result.status) {
            case 'ok':
              return json(200, { publicationNo: result.publicationNo })
            case 'not_found':
              return json(404, { code: 'PUBLICATION_NOT_FOUND' })
            case 'forbidden':
              return json(403, { code: 'FORBIDDEN' })
            case 'campus_not_found':
              return json(404, { code: 'CAMPUS_NOT_FOUND' })
          }
        }

        // ── Publish a saved commit ──
        const atCommit = await repo.partsAtCommit(campusId, commitNo)
        switch (atCommit.status) {
          case 'not_found':
            return json(404, { code: 'COMMIT_NOT_FOUND' })
          case 'pruned':
            return json(409, { code: 'COMMIT_PRUNED' })
          case 'campus_not_found':
            return json(404, { code: 'CAMPUS_NOT_FOUND' })
        }

        const unsupported = unsupportedParts(atCommit.parts)
        if (unsupported.length > 0) return json(422, { code: 'UNSUPPORTED_PART', parts: unsupported })

        const records: PartRecord[] = atCommit.parts.map((part) => (
          typeof part.contentBase64 === 'string'
            ? { key: part.partKey, content: null, contentBase64: part.contentBase64, sortKey: part.sortKey }
            : { key: part.partKey, content: part.content, sortKey: part.sortKey }
        ))
        let document: CampusDocument
        try {
          document = joinParts(records)
        } catch (error) {
          return json(422, {
            code: 'COMPILE_FAILED',
            diagnostics: [{ code: 'JOIN_FAILED', message: errorMessage(error, 'The saved parts could not be joined.') }],
          })
        }

        // R33: PublishService's hard gate. Route errors block publishing, even forced.
        const routeErrors = validateRouteNetwork(document, 'publish').filter((issue) => issue.severity === 'error')
        if (routeErrors.length > 0) return json(422, { code: 'ROUTE_INVALID', diagnostics: routeErrors })

        let compiled: ReturnType<CampusCompiler['compileV2']>
        try {
          compiled = new CampusCompiler().compileV2(document)
        } catch (error) {
          return json(422, {
            code: 'COMPILE_FAILED',
            diagnostics: [{ code: 'COMPILE_EXCEPTION', message: errorMessage(error, 'Internal compilation error') }],
          })
        }
        if (!compiled.success || !compiled.graph) {
          return json(422, { code: 'COMPILE_FAILED', diagnostics: compiled.errors })
        }

        const artifacts = compileRouteArtifacts(compiled)
        // Terrain plan: the campus-only site package (baked ground, road surfaces, structures).
        const site = buildSiteArtifact(document)
        if (site) artifacts.site = site
        const metadata: AnyRecord = isRecord(artifacts.metadata) ? artifacts.metadata : {}
        // Legacy publish refuses artifacts whose provenance names another campus.
        if (typeof metadata.campusId === 'string' && metadata.campusId !== campusId) {
          return json(422, {
            code: 'ARTIFACT_INVALID',
            diagnostics: [{
              code: 'ARTIFACT_CAMPUS_ID_MISMATCH',
              message: 'Campus identity does not match compiler source provenance',
              path: 'metadata.campusId',
            }],
            warnings: [],
          })
        }

        // Same fields as the legacy publish route (src/app/api/publish/route.ts).
        const validation = validateNavigationArtifacts({
          graph: artifacts.navigationGraph,
          buildingIndex: artifacts.buildingIndex,
          metadata: artifacts.metadata,
          components: artifacts.components,
          doors: artifacts.doors,
          floorGeometry: artifacts.floorGeometry,
          panoramaIndex: artifacts.panoramaIndex,
          qrIndex: artifacts.qrIndex,
          terrainAreas: artifacts.terrainAreas,
          terrainVerticalDatum: artifacts.terrainVerticalDatum,
        })
        if (!validation.valid) {
          return json(422, { code: 'ARTIFACT_INVALID', diagnostics: validation.errors, warnings: validation.warnings })
        }

        // Legacy guard: a normal publish never clears a non-empty public map.
        if (graphIsEmpty(artifacts)) {
          const current = await repo.currentPublication(campusId)
          if (current.status === 'ok' && current.publication && graphHasNodesOrEdges(current.publication.artifacts)) {
            return json(422, {
              code: 'ARTIFACT_INVALID',
              diagnostics: [{
                code: 'ARTIFACT_EMPTY_GRAPH_REPLACEMENT',
                message: 'Normal Publish cannot clear an existing non-empty campus publication',
              }],
              warnings: [],
            })
          }
        }

        // Ruling R32: revision and sourceDocumentVersion are both the commit number.
        const blob = buildArtifactsBlob(artifacts, campusId, commitNo, commitNo)
        const checksum = await sha256Hex(canonicalJson(blob))
        const recorded = await repo.recordPublication(campusId, commitNo, blob, checksum, actor.id, actor.isSuperAdmin)
        switch (recorded.status) {
          case 'ok':
            return json(200, { publicationNo: recorded.publicationNo, commitNo })
          case 'pruned':
            // The commit was pruned between reading its parts and recording (R23).
            return json(409, { code: 'COMMIT_PRUNED' })
          case 'forbidden':
            return json(403, { code: 'FORBIDDEN' })
          case 'campus_not_found':
            return json(404, { code: 'CAMPUS_NOT_FOUND' })
        }
      })
    },
  }
}

export type PublishHandlers = ReturnType<typeof createPublishHandlers>
