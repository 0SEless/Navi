// Shared request and result types for the Save v2 server. Type-only: the client
// imports them too, so this file has no runtime code.
//
// The result types mirror, field for field, the JSON that the SQL functions in
// supabase/migrations/20261101000000_studio_v2.sql emit (camelCase as emitted). The
// repository does not remap statuses; the routes (and the client) map them.
import type { PartKey, ZoneKey } from '../parts/part-keys'

export type CampusRole = 'owner' | 'editor' | 'viewer'

/** Statuses that more than one function can return. */
export interface CampusNotFound {
  status: 'campus_not_found'
}
export interface Forbidden {
  status: 'forbidden'
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * One saved part version as the read functions return it. JSON parts carry `content`,
 * binary parts carry `contentBase64` (the other one is null). `deleted` is present on
 * changes_since; load and parts_at_commit omit tombstones.
 * Field names are the SQL ones (`partKey`, not `key`).
 */
export interface PartRecordWithVersion {
  partKey: PartKey
  versionNo: number
  checksum: string
  sortKey: string | null
  content: unknown
  contentBase64: string | null
  deleted?: boolean
}

// ---------------------------------------------------------------------------
// studio.save
// ---------------------------------------------------------------------------

interface SaveChangeBase {
  partKey: PartKey
  /** 0 means "new part"; otherwise the version the client last saw. */
  expectedVersion: number
  sortKey?: string | null
}

export interface SavePutChange extends SaveChangeBase {
  op: 'put'
  /** sha256 hex of the canonical JSON of `content`. */
  checksum: string
  content: unknown
  sizeBytes: number
}

export interface SavePutBinChange extends SaveChangeBase {
  op: 'put-bin'
  /** sha256 hex of the bytes. */
  checksum: string
  contentBase64: string
}

export interface SaveDeleteChange extends SaveChangeBase {
  op: 'delete'
}

export type SaveChange = SavePutChange | SavePutBinChange | SaveDeleteChange

export interface SaveInput {
  campusId: string
  actor: string
  session: string
  mutationId: string
  baseCommit: number
  message: string | null
  changes: SaveChange[]
  /** sha256 hex (64 lowercase) of the canonical request; a retry with the same mutationId must send the same value. */
  requestChecksum: string
  /** Display name recorded with the commit, so conflicts name the admin rather than an id. */
  actorName?: string | null
}

export interface SavedPart {
  partKey: PartKey
  versionNo: number
  checksum: string
}

/** A part another actor saved after `baseCommit` (one of content / contentBase64 is set). */
export interface OtherChangedPart {
  partKey: PartKey
  versionNo: number
  checksum: string
  deleted: boolean
  sortKey: string | null
  content?: unknown
  contentBase64?: string
}

export interface StalePart {
  partKey: PartKey
  yourVersion: number
  currentVersion: number
  savedBy: string | null
  savedAt: string | null
}

/** A zone `save` needed but the session does not hold; holderName is null when it is free or expired. */
export interface ZoneNotHeld {
  zoneKey: ZoneKey
  holderName: string | null
}

export interface SaveOk {
  status: 'ok'
  /** null when every change was a no-op and no commit was written. */
  commitNo: number | null
  parts: SavedPart[]
  othersChanged: OtherChangedPart[]
}
/** A retried mutationId: the stored reply of the first accepted save. */
export interface SaveReplay extends Omit<SaveOk, 'status'> {
  status: 'replay'
}
export interface SaveStale {
  status: 'stale'
  parts: StalePart[]
}
export interface SaveZoneNotHeld {
  status: 'zone_not_held'
  zones: ZoneNotHeld[]
}
export interface SaveMutationCollision {
  status: 'mutation_collision'
}

export type SaveDbResult =
  | SaveOk
  | SaveReplay
  | SaveStale
  | SaveZoneNotHeld
  | SaveMutationCollision
  | Forbidden
  | CampusNotFound

// ---------------------------------------------------------------------------
// Zone locks
// ---------------------------------------------------------------------------

/** A zone that is held by someone else. sameActor: the holder is you, in another session (tab). */
export interface ZoneDenial {
  zoneKey: ZoneKey
  holderName: string
  since: string
  sameActor: boolean
}

export interface ZoneLockView {
  zoneKey: ZoneKey
  holderName: string
  holderIsMe: boolean
  since: string
}

export interface AcquireOk {
  status: 'ok'
  granted: ZoneKey[]
  denied: ZoneDenial[]
}
export type AcquireResult = AcquireOk | Forbidden | CampusNotFound

export interface ReleaseOk {
  status: 'ok'
  released: ZoneKey[]
}
export type ReleaseResult = ReleaseOk | CampusNotFound

export interface StatusOk {
  status: 'ok'
  headCommit: number
  locks: ZoneLockView[]
  lostZones: ZoneKey[]
  /** Added by the status route from roleOf; the SQL function does not emit it. */
  myRole?: CampusRole
}
export type StatusResult = StatusOk | CampusNotFound

export interface ForceReleaseOk {
  status: 'ok'
  /** false when the zone had no lock row. */
  released: boolean
}
export type ForceReleaseResult = ForceReleaseOk | Forbidden | CampusNotFound

// ---------------------------------------------------------------------------
// Load and history
// ---------------------------------------------------------------------------

export interface LoadOk {
  status: 'ok'
  headCommit: number
  parts: PartRecordWithVersion[]
}
export type LoadResult = LoadOk | CampusNotFound

/** A part changed after a commit; tombstones included (`deleted`). */
export interface ChangedPart extends PartRecordWithVersion {
  deleted: boolean
  commitNo: number
  author: string
}
export interface ChangesOk {
  status: 'ok'
  headCommit: number
  parts: ChangedPart[]
}
export type ChangesResult = ChangesOk | CampusNotFound

export interface PartsAtCommitOk {
  status: 'ok'
  commitNo: number
  parts: PartRecordWithVersion[]
}
/** not_found: the commit is below 0 or above the head. pruned: pruning removed that history. */
export type PartsAtCommitResult =
  | PartsAtCommitOk
  | { status: 'not_found' }
  | { status: 'pruned' }
  | CampusNotFound

// ---------------------------------------------------------------------------
// Campuses
// ---------------------------------------------------------------------------

export interface CampusRow {
  id: string
  name: string
  settings: Record<string, unknown>
  headCommit: number
  createdAt: string
  /** null when the campus was never published. */
  publishedAt: string | null
}
export interface ListCampusesResult {
  status: 'ok'
  campuses: CampusRow[]
}

export type CreateCampusResult = { status: 'ok'; campusId: string } | { status: 'exists' }
export type DeleteCampusResult = { status: 'ok' } | Forbidden | CampusNotFound
export type UpdateCampusSettingsResult = { status: 'ok' } | Forbidden | CampusNotFound

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export interface PublicationRow {
  publicationNo: number
  sourceCommit: number
  artifacts: Record<string, unknown>
  /** The campus name and settings as they were when the publication was recorded. */
  campusName: string
  campusSettings: Record<string, unknown>
  publishedAt: string
}

export type RecordPublicationResult =
  | { status: 'ok'; publicationNo: number }
  | { status: 'pruned' }
  | Forbidden
  | CampusNotFound

export type RollbackPublicationResult =
  | { status: 'ok'; publicationNo: number }
  | { status: 'not_found' }
  | Forbidden
  | CampusNotFound

/** `publication` is null when the campus was never published. */
export type CurrentPublicationResult =
  | { status: 'ok'; publication: PublicationRow | null }
  | CampusNotFound

export interface PublishedCampusRow {
  id: string
  name: string
  settings: Record<string, unknown>
  publicationNo: number
  publishedAt: string
}
export interface PublishedCampusesResult {
  status: 'ok'
  campuses: PublishedCampusRow[]
}
