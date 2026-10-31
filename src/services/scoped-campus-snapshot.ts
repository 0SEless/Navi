import type { CampusDocument } from '@navi/core'
import type { ScopedSaveKind, ScopedSaveScope } from './scoped-campus-save'
import { hashDurableScopedContent } from './scoped-save-client'

export interface ScopedCampusSnapshotEntry {
  scope: ScopedSaveScope
  revision: number
  contentChecksum: string
  content: unknown
}

export interface ScopedCampusSnapshot {
  campusId: string
  revision: number
  checksum: string
  scopes: Record<string, ScopedCampusSnapshotEntry>
}

const saveKinds: readonly ScopedSaveKind[] = ['building', 'routing', 'terrain', 'campus-settings']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTombstone(value: unknown): boolean {
  return isRecord(value) && value._naviLocalTombstone === true
}

function validScope(scope: unknown): scope is ScopedSaveScope {
  return isRecord(scope) && saveKinds.includes(scope.kind as ScopedSaveKind) &&
    typeof scope.id === 'string' && scope.id.length > 0 && scope.id === scope.id.trim()
}

function setArray(target: Record<string, unknown>, key: string, value: unknown): void {
  if (Array.isArray(value)) target[key] = structuredClone(value)
}

/** Verify and merge a complete E5 reconstruction over the current editor document. */
export async function applyScopedCampusSnapshot(
  base: CampusDocument,
  snapshot: ScopedCampusSnapshot,
): Promise<CampusDocument> {
  if (
    !snapshot || snapshot.campusId !== base.metadata?.campusId ||
    !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
    !isRecord(snapshot.scopes) || !/^[a-f0-9]{64}$/.test(snapshot.checksum)
  ) {
    throw new Error('The E5 scoped snapshot has an invalid campus identity, revision, or checksum.')
  }

  const orderedScopes: Record<string, ScopedCampusSnapshotEntry> = {}
  for (const [key, entry] of Object.entries(snapshot.scopes).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    if (
      !isRecord(entry) || !validScope(entry.scope) || key !== `${entry.scope.kind}:${entry.scope.id}` ||
      !Number.isSafeInteger(entry.revision) || entry.revision < 0 || entry.revision > snapshot.revision ||
      typeof entry.contentChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(entry.contentChecksum)
    ) {
      throw new Error('The E5 scoped snapshot contains an invalid scope record.')
    }
    if (await hashDurableScopedContent(entry.content) !== entry.contentChecksum) {
      throw new Error(`The E5 scoped snapshot content checksum failed for ${key}.`)
    }
    orderedScopes[key] = entry as unknown as ScopedCampusSnapshotEntry
  }
  if (await hashDurableScopedContent({ campusId: snapshot.campusId, revision: snapshot.revision, scopes: orderedScopes }) !== snapshot.checksum) {
    throw new Error('The E5 scoped campus checksum did not match its reconstructed scopes.')
  }

  const document = structuredClone(base)
  for (const entry of Object.values(orderedScopes)) {
    const { kind, id } = entry.scope
    const content = entry.content
    if (kind === 'building') {
      const index = document.buildings.findIndex((building) => building.id === id)
      if (isTombstone(content)) {
        if (index >= 0) document.buildings.splice(index, 1)
      } else {
        if (!isRecord(content) || content.id !== id) throw new Error(`The E5 building scope ${id} has invalid content identity.`)
        const building = structuredClone(content) as unknown as CampusDocument['buildings'][number]
        if (index >= 0) document.buildings[index] = building
        else document.buildings.push(building)
      }
      continue
    }
    if (kind === 'routing' && id !== snapshot.campusId) {
      const building = document.buildings.find((candidate) => candidate.id === id)
      if (!building) continue
      if (isTombstone(content)) {
        delete building.verticalTransitions
        for (const floor of building.floors) {
          delete floor.routeNetwork
          delete floor.entranceAccess
        }
        continue
      }
      if (!isRecord(content) || !Array.isArray(content.floors)) throw new Error(`The E5 routing scope ${id} has invalid content.`)
      if (Array.isArray(content.verticalTransitions)) building.verticalTransitions = structuredClone(content.verticalTransitions) as typeof building.verticalTransitions
      for (const routeFloor of content.floors) {
        if (!isRecord(routeFloor) || typeof routeFloor.floorId !== 'string') continue
        const floor = building.floors.find((candidate) => candidate.id === routeFloor.floorId)
        if (!floor) continue
        if (routeFloor.routeNetwork === null) delete floor.routeNetwork
        else if (routeFloor.routeNetwork !== undefined) floor.routeNetwork = structuredClone(routeFloor.routeNetwork) as typeof floor.routeNetwork
        if (Array.isArray(routeFloor.entranceAccess)) floor.entranceAccess = structuredClone(routeFloor.entranceAccess) as typeof floor.entranceAccess
        else delete floor.entranceAccess
      }
      continue
    }
    if (kind === 'routing') {
      if (isTombstone(content)) {
        document.roads = []
        document.roadJunctions = []
        document.separatedCrossings = []
      } else {
        if (!isRecord(content)) throw new Error('The E5 campus routing scope has invalid content.')
        setArray(document as unknown as Record<string, unknown>, 'roads', content.roads)
        setArray(document as unknown as Record<string, unknown>, 'roadJunctions', content.roadJunctions)
        setArray(document as unknown as Record<string, unknown>, 'separatedCrossings', content.separatedCrossings)
      }
      continue
    }
    if (kind === 'terrain') {
      if (isTombstone(content)) {
        document.boundary = undefined
        document.areas = []
      } else {
        if (!isRecord(content)) throw new Error('The E5 terrain scope has invalid content.')
        if (content.boundary === null) document.boundary = undefined
        else if (content.boundary !== undefined) document.boundary = structuredClone(content.boundary) as CampusDocument['boundary']
        setArray(document as unknown as Record<string, unknown>, 'areas', content.areas)
        if (Array.isArray(content.terrainAreas)) document.terrainAreas = structuredClone(content.terrainAreas) as CampusDocument['terrainAreas']
        if (isRecord(content.terrainVerticalDatum)) document.terrainVerticalDatum = structuredClone(content.terrainVerticalDatum) as unknown as CampusDocument['terrainVerticalDatum']
      }
      continue
    }
    if (kind === 'campus-settings' && !isTombstone(content)) {
      if (!isRecord(content)) throw new Error('The E5 campus settings scope has invalid content.')
      if (typeof content.schemaVersion === 'number') document.schemaVersion = content.schemaVersion
      if (isRecord(content.metadata)) document.metadata = { ...document.metadata, ...structuredClone(content.metadata), campusId: snapshot.campusId }
      if (typeof content.connectivitySemanticsVersion === 'string') document.connectivitySemanticsVersion = content.connectivitySemanticsVersion
      else if (content.connectivitySemanticsVersion === null) document.connectivitySemanticsVersion = undefined
    }
  }
  document.metadata.campusId = snapshot.campusId
  return document
}
