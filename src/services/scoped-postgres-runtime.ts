import { Pool } from 'pg'
import type { ScopedPgPool } from './scoped-postgres-adapter'

export interface E5ScopedPostgresConfig {
  host: '127.0.0.1'
  port: 55433
  database: 'navi_e4_test'
  user: 'navi_e4_runner'
  password: string
}

export type ScopedPostgresRuntimeErrorCode = 'DISABLED' | 'E5_CONFIGURATION_REQUIRED' | 'E5_IDENTITY_MISMATCH'

export class ScopedPostgresRuntimeError extends Error {
  constructor(readonly code: ScopedPostgresRuntimeErrorCode, message: string) {
    super(message)
    this.name = 'ScopedPostgresRuntimeError'
  }
}

export function readE5ScopedPostgresConfig(
  env: Record<string, string | undefined> = process.env,
): E5ScopedPostgresConfig {
  if (env.NODE_ENV !== 'development' || env.NAVI_STUDIO_DURABLE_SCOPED_SAVE !== '1') {
    throw new ScopedPostgresRuntimeError('DISABLED', 'The local E5 scoped persistence runtime is disabled.')
  }

  const host = env.NAVI_E5_PG_HOST
  const port = Number(env.NAVI_E5_PG_PORT)
  const database = env.NAVI_E5_PG_DATABASE
  const user = env.NAVI_E5_PG_USER
  const password = env.NAVI_E5_PG_PASSWORD
  if (
    host !== '127.0.0.1' ||
    port !== 55433 ||
    database !== 'navi_e4_test' ||
    user !== 'navi_e4_runner' ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new ScopedPostgresRuntimeError(
      'E5_CONFIGURATION_REQUIRED',
      'The local scoped persistence runtime requires the verified E5 synthetic database configuration and a non-empty password.',
    )
  }
  return { host: '127.0.0.1', port: 55433, database: 'navi_e4_test', user: 'navi_e4_runner', password }
}

let pool: Pool | null = null

/** Creates one server-side pool only after the local feature and E5 config gates pass. */
export function getE5ScopedPostgresPool(
  env: Record<string, string | undefined> = process.env,
): ScopedPgPool {
  if (typeof window !== 'undefined') {
    throw new ScopedPostgresRuntimeError('DISABLED', 'The E5 PostgreSQL pool is server-only.')
  }
  const config = readE5ScopedPostgresConfig(env)
  pool ??= new Pool({
    ...config,
    max: 4,
    connectionTimeoutMillis: 3000,
    application_name: 'navi-e8-e5-synthetic',
  })
  return pool as unknown as ScopedPgPool
}

/** Refuses any database that does not match the protected E5 synthetic identity. */
export async function assertE5ScopedDatabaseIdentity(poolValue: ScopedPgPool): Promise<void> {
  const client = await poolValue.connect()
  try {
    const result = await client.query<{
      database: string
      role: string
      version_num: number
      marker: string | null
    }>(`
      SELECT current_database() AS database,
             session_user AS role,
             current_setting('server_version_num')::integer AS version_num,
             shobj_description(d.oid, 'pg_database') AS marker
      FROM pg_database AS d
      WHERE d.datname = current_database()
    `)
    const identity = result.rows[0]
    const version = Number(identity?.version_num)
    if (
      identity?.database !== 'navi_e4_test' ||
      identity.role !== 'navi_e4_runner' ||
      !Number.isInteger(version) ||
      version < 170000 || version >= 180000 ||
      identity.marker !== 'navi-e4-synthetic-v1'
    ) {
      throw new ScopedPostgresRuntimeError(
        'E5_IDENTITY_MISMATCH',
        'The PostgreSQL connection is not the approved E5 synthetic database identity.',
      )
    }
  } finally {
    client.release()
  }
}
