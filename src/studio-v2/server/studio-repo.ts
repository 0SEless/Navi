// Typed repository over the studio.* SQL functions: one method per function, each a
// single `SELECT studio.fn($1, ...) AS r`. No named prepared statements (Supabase
// transaction pooler), no status remapping (the routes map statuses to HTTP), and no
// error handling: database errors, including SQLSTATE 22023 for invalid input
// (messages start with INVALID_CHANGE:, INVALID_ZONE: or INVALID_ARGUMENT:), propagate.
//
// studio.prune is deliberately absent: it is not granted to the API role.
import { getStudioPool } from './studio-db'
import type {
  AcquireResult,
  CampusRole,
  ChangesResult,
  CreateCampusResult,
  CurrentPublicationResult,
  DeleteCampusResult,
  ForceReleaseResult,
  ListCampusesResult,
  LoadResult,
  PartsAtCommitResult,
  PublishedCampusesResult,
  RecordPublicationResult,
  ReleaseResult,
  RollbackPublicationResult,
  SaveDbResult,
  SaveInput,
  StatusResult,
  UpdateCampusSettingsResult,
} from './types'

/** The slice of a pg Pool or Client that the repository needs. */
export interface StudioQueryable {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

/** Every SQL function returns jsonb; node-postgres parses it, a text-typed reply is parsed here. */
function resultOf<T>(rows: Array<Record<string, unknown>>, fn: string): T {
  const row = rows[0]
  if (!row || !('r' in row)) {
    throw new Error(`studio.${fn} returned no result row.`)
  }
  const value = row.r
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}

export function createStudioRepo(db: StudioQueryable) {
  async function call<T>(text: string, values: readonly unknown[], fn: string): Promise<T> {
    const { rows } = await db.query(text, values)
    return resultOf<T>(rows, fn)
  }

  return {
    /** studio.save: the one Studio save. Statuses are returned as-is. */
    save(input: SaveInput): Promise<SaveDbResult> {
      return call(
        'SELECT studio.save($1::text, $2::text, $3::text, $4::text, $5::bigint, $6::text, $7::jsonb, $8::char(64)) AS r',
        [
          input.campusId,
          input.actor,
          input.session,
          input.mutationId,
          input.baseCommit,
          input.message,
          JSON.stringify(input.changes),
          input.requestChecksum,
        ],
        'save',
      )
    },

    acquireZones(
      campusId: string,
      actor: string,
      actorName: string,
      session: string,
      zones: readonly string[],
    ): Promise<AcquireResult> {
      return call(
        'SELECT studio.acquire_zones($1::text, $2::text, $3::text, $4::text, $5::text[]) AS r',
        [campusId, actor, actorName, session, [...zones]],
        'acquire_zones',
      )
    },

    releaseZones(campusId: string, actor: string, session: string, zones: readonly string[]): Promise<ReleaseResult> {
      return call(
        'SELECT studio.release_zones($1::text, $2::text, $3::text, $4::text[]) AS r',
        [campusId, actor, session, [...zones]],
        'release_zones',
      )
    },

    /** Status poll and heartbeat: refreshes the locks in `held` that this actor and session still own. */
    status(campusId: string, actor: string, session: string, held: readonly string[]): Promise<StatusResult> {
      return call(
        'SELECT studio.status($1::text, $2::text, $3::text, $4::text[]) AS r',
        [campusId, actor, session, [...held]],
        'status',
      )
    },

    forceRelease(
      campusId: string,
      actor: string,
      zone: string,
      actorIsSuperAdmin: boolean,
    ): Promise<ForceReleaseResult> {
      return call(
        'SELECT studio.force_release($1::text, $2::text, $3::text, $4::boolean) AS r',
        [campusId, actor, zone, actorIsSuperAdmin],
        'force_release',
      )
    },

    load(campusId: string): Promise<LoadResult> {
      return call('SELECT studio.load($1::text) AS r', [campusId], 'load')
    },

    changesSince(campusId: string, since: number): Promise<ChangesResult> {
      return call('SELECT studio.changes_since($1::text, $2::bigint) AS r', [campusId, since], 'changes_since')
    },

    partsAtCommit(campusId: string, commitNo: number): Promise<PartsAtCommitResult> {
      return call('SELECT studio.parts_at_commit($1::text, $2::bigint) AS r', [campusId, commitNo], 'parts_at_commit')
    },

    recordPublication(
      campusId: string,
      sourceCommit: number,
      artifacts: Record<string, unknown>,
      checksum: string,
      actor: string,
      actorIsSuperAdmin: boolean,
    ): Promise<RecordPublicationResult> {
      return call(
        'SELECT studio.record_publication($1::text, $2::bigint, $3::jsonb, $4::char(64), $5::text, $6::boolean) AS r',
        [campusId, sourceCommit, JSON.stringify(artifacts), checksum, actor, actorIsSuperAdmin],
        'record_publication',
      )
    },

    rollbackPublication(
      campusId: string,
      publicationNo: number,
      actor: string,
      actorIsSuperAdmin: boolean,
    ): Promise<RollbackPublicationResult> {
      return call(
        'SELECT studio.rollback_publication($1::text, $2::bigint, $3::text, $4::boolean) AS r',
        [campusId, publicationNo, actor, actorIsSuperAdmin],
        'rollback_publication',
      )
    },

    currentPublication(campusId: string): Promise<CurrentPublicationResult> {
      return call('SELECT studio.current_publication($1::text) AS r', [campusId], 'current_publication')
    },

    publishedCampuses(): Promise<PublishedCampusesResult> {
      return call('SELECT studio.published_campuses() AS r', [], 'published_campuses')
    },

    listCampuses(): Promise<ListCampusesResult> {
      return call('SELECT studio.list_campuses() AS r', [], 'list_campuses')
    },

    createCampus(
      campusId: string,
      name: string,
      actor: string,
      settings: Record<string, unknown>,
    ): Promise<CreateCampusResult> {
      return call(
        'SELECT studio.create_campus($1::text, $2::text, $3::text, $4::jsonb) AS r',
        [campusId, name, actor, JSON.stringify(settings)],
        'create_campus',
      )
    },

    deleteCampus(campusId: string, actor: string, actorIsSuperAdmin: boolean): Promise<DeleteCampusResult> {
      return call(
        'SELECT studio.delete_campus($1::text, $2::text, $3::boolean) AS r',
        [campusId, actor, actorIsSuperAdmin],
        'delete_campus',
      )
    },

    /** `name` null keeps the current name; `settings` replaces the settings object. */
    updateCampusSettings(
      campusId: string,
      actor: string,
      name: string | null,
      settings: Record<string, unknown>,
    ): Promise<UpdateCampusSettingsResult> {
      return call(
        'SELECT studio.update_campus_settings($1::text, $2::text, $3::text, $4::jsonb) AS r',
        [campusId, actor, name, JSON.stringify(settings)],
        'update_campus_settings',
      )
    },

    /** members.role, 'editor' when the actor has no members row, null when the campus does not exist. */
    async roleOf(campusId: string, actor: string): Promise<CampusRole | null> {
      const { rows } = await db.query('SELECT studio.role_of($1::text, $2::text) AS r', [campusId, actor])
      const row = rows[0]
      if (!row || !('r' in row)) throw new Error('studio.role_of returned no result row.')
      return (row.r ?? null) as CampusRole | null
    },
  }
}

export type StudioRepo = ReturnType<typeof createStudioRepo>

let defaultRepo: StudioRepo | null = null

/**
 * The default repository over the guarded pool. Created on first use, so importing this
 * module never connects (or reads NAVI_STUDIO_DATABASE_URL).
 */
export const studioRepo: StudioRepo = new Proxy({} as StudioRepo, {
  get(_target, property) {
    defaultRepo ??= createStudioRepo(getStudioPool())
    return Reflect.get(defaultRepo, property)
  },
  has(_target, property) {
    defaultRepo ??= createStudioRepo(getStudioPool())
    return Reflect.has(defaultRepo, property)
  },
})
