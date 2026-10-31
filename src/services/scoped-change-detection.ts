import type { CampusDocument } from '@navi/core'
import { canonicalJson } from '../studio-v2/parts/canonical'
import type { ScopedSaveKind, ScopedSaveScope } from './scoped-campus-save'

export interface ScopedDocumentOperation {
  scope: ScopedSaveScope
  content: unknown
  dependencyScopes: ScopedSaveScope[]
}

export type ScopedDocumentChangeResult =
  | { status: 'unchanged' }
  | { status: 'rejected'; code: 'CAMPUS_IDENTITY_MISMATCH' | 'AMBIGUOUS_SCOPE' | 'UNSUPPORTED_CHANGE'; message: string }
  | { status: 'classified'; multiScope: boolean; operations: ScopedDocumentOperation[] }

export interface ScopedDocumentProjection {
  scope: ScopedSaveScope
  content: unknown
  dependencyScopes: ScopedSaveScope[]
}

export type ScopedDocumentProjectionResult =
  | { status: 'projected'; scopes: ScopedDocumentProjection[] }
  | { status: 'rejected'; code: 'CAMPUS_IDENTITY_MISMATCH' | 'AMBIGUOUS_SCOPE'; message: string }

type DocumentRecord = CampusDocument & Record<string, unknown>

function scopeKey(scope: ScopedSaveScope): string {
  return `${scope.kind}:${scope.id}`
}

function scope(kind: ScopedSaveKind, id: string): ScopedSaveScope {
  return { kind, id }
}

function makeProjections(document: CampusDocument, campusId: string): Map<string, ScopedDocumentProjection> {
  const source = document as DocumentRecord
  const projections = new Map<string, ScopedDocumentProjection>()
  const buildings = Array.isArray(source.buildings) ? source.buildings : []
  const buildingIds = new Set<string>()

  for (const building of buildings) {
    if (typeof building?.id !== 'string' || !building.id.trim() || building.id !== building.id.trim() || buildingIds.has(building.id)) {
      throw new Error('Building identities are missing, malformed, or duplicated.')
    }
    buildingIds.add(building.id)
    const floorIds = new Set<string>()
    const floors = Array.isArray(building.floors) ? building.floors : []
    for (const floor of floors) {
      if (typeof floor?.id !== 'string' || !floor.id.trim() || floorIds.has(floor.id)) {
        throw new Error(`Building ${building.id} has a missing or duplicate floor identity.`)
      }
      floorIds.add(floor.id)
    }

    const buildingScope = scope('building', building.id)
    const routeFloors = floors.map((floor) => ({
      floorId: floor.id,
      routeNetwork: floor.routeNetwork ?? null,
      entranceAccess: floor.entranceAccess ?? [],
    }))
    const hasRouting = routeFloors.some((floor) => floor.routeNetwork !== null || floor.entranceAccess.length > 0) ||
      (Array.isArray(building.verticalTransitions) && building.verticalTransitions.length > 0)

    const buildingFields = { ...building }
    delete buildingFields.verticalTransitions
    const buildingContent = {
      ...buildingFields,
      floors: floors.map((floor) => {
        const buildingFloorFields = { ...floor }
        delete buildingFloorFields.routeNetwork
        delete buildingFloorFields.entranceAccess
        return buildingFloorFields
      }),
    }
    projections.set(scopeKey(buildingScope), {
      scope: buildingScope,
      content: buildingContent,
      dependencyScopes: hasRouting ? [scope('routing', building.id)] : [],
    })

    if (hasRouting) {
      const routeScope = scope('routing', building.id)
      projections.set(scopeKey(routeScope), {
        scope: routeScope,
        content: {
          buildingId: building.id,
          floors: routeFloors,
          verticalTransitions: building.verticalTransitions ?? [],
        },
        dependencyScopes: [buildingScope],
      })
    }
  }

  const campusRoutingScope = scope('routing', campusId)
  projections.set(scopeKey(campusRoutingScope), {
    scope: campusRoutingScope,
    content: {
      roads: source.roads ?? [],
      roadJunctions: source.roadJunctions ?? [],
      separatedCrossings: source.separatedCrossings ?? [],
    },
    dependencyScopes: [],
  })

  const terrainScope = scope('terrain', campusId)
  const terrainContent: Record<string, unknown> = { boundary: source.boundary ?? null, areas: source.areas ?? [] }
  // Keep absent additive terrain fields absent for legacy documents so simply
  // hydrating and saving them cannot change their terrain scope checksum.
  if (source.terrainAreas !== undefined) terrainContent.terrainAreas = source.terrainAreas
  if (source.terrainVerticalDatum !== undefined) terrainContent.terrainVerticalDatum = source.terrainVerticalDatum
  projections.set(scopeKey(terrainScope), {
    scope: terrainScope,
    content: terrainContent,
    dependencyScopes: [],
  })

  const campusSettingsScope = scope('campus-settings', campusId)
  const metadata = { ...(source.metadata ?? {}) } as Record<string, unknown>
  delete metadata.campusId
  delete metadata.lastModified
  delete metadata.editorVersion
  projections.set(scopeKey(campusSettingsScope), {
    scope: campusSettingsScope,
    content: {
      schemaVersion: source.schemaVersion,
      metadata,
      connectivitySemanticsVersion: source.connectivitySemanticsVersion ?? null,
    },
    dependencyScopes: [],
  })

  return projections
}

function unsupportedProjection(document: CampusDocument): unknown {
  const source = { ...(document as DocumentRecord) }
  for (const key of [
    'schemaVersion', 'version', 'metadata', 'buildings', 'roads', 'roadJunctions',
    'separatedCrossings', 'areas', 'boundary', 'terrainAreas', 'terrainVerticalDatum', 'connectivitySemanticsVersion', '_changeJournal',
  ]) delete source[key]
  return source
}

function reject(
  code: 'CAMPUS_IDENTITY_MISMATCH' | 'AMBIGUOUS_SCOPE' | 'UNSUPPORTED_CHANGE',
  message: string,
): ScopedDocumentChangeResult {
  return { status: 'rejected', code, message }
}

/** Derive deterministic building/routing/terrain/settings operations from document snapshots. */
export function deriveScopedDocumentChanges(
  before: CampusDocument,
  after: CampusDocument,
  activeCampusId: string,
): ScopedDocumentChangeResult {
  if (
    !activeCampusId.trim() ||
    before.metadata?.campusId !== activeCampusId ||
    after.metadata?.campusId !== activeCampusId
  ) {
    return reject('CAMPUS_IDENTITY_MISMATCH', 'The active campus identity does not match both document snapshots.')
  }

  if (canonicalJson(unsupportedProjection(before)) !== canonicalJson(unsupportedProjection(after))) {
    return reject('UNSUPPORTED_CHANGE', 'The document change includes content that has no scoped persistence mapping.')
  }

  let previous: Map<string, ScopedDocumentProjection>
  let current: Map<string, ScopedDocumentProjection>
  try {
    previous = makeProjections(before, activeCampusId)
    current = makeProjections(after, activeCampusId)
  } catch (error) {
    return reject('AMBIGUOUS_SCOPE', error instanceof Error ? error.message : 'The changed document has ambiguous scope identity.')
  }

  const keys = [...new Set([...previous.keys(), ...current.keys()])].sort()
  const operations: ScopedDocumentOperation[] = []
  for (const key of keys) {
    const oldProjection = previous.get(key)
    const newProjection = current.get(key)
    if (oldProjection && newProjection && canonicalJson(oldProjection.content) === canonicalJson(newProjection.content)) continue
    if (newProjection) {
      operations.push({
        scope: newProjection.scope,
        content: newProjection.content,
        dependencyScopes: newProjection.dependencyScopes.filter((dependency) => previous.has(scopeKey(dependency))),
      })
    } else if (oldProjection) {
      operations.push({
        scope: oldProjection.scope,
        content: { _naviLocalTombstone: true, scope: oldProjection.scope },
        dependencyScopes: oldProjection.dependencyScopes.filter((dependency) => previous.has(scopeKey(dependency))),
      })
    }
  }

  if (operations.length === 0) return { status: 'unchanged' }
  return { status: 'classified', multiScope: operations.length > 1, operations }
}

/** Project the initial known scopes for an ephemeral local-history session. */
export function projectScopedDocument(
  document: CampusDocument,
  activeCampusId: string,
): ScopedDocumentProjectionResult {
  if (!activeCampusId.trim() || document.metadata?.campusId !== activeCampusId) {
    return { status: 'rejected', code: 'CAMPUS_IDENTITY_MISMATCH', message: 'The active campus identity does not match the document.' }
  }
  try {
    const projections = makeProjections(document, activeCampusId)
    return {
      status: 'projected',
      scopes: [...projections.values()].sort((left, right) => scopeKey(left.scope).localeCompare(scopeKey(right.scope))),
    }
  } catch (error) {
    return {
      status: 'rejected',
      code: 'AMBIGUOUS_SCOPE',
      message: error instanceof Error ? error.message : 'The document has ambiguous scope identity.',
    }
  }
}
