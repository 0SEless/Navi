import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const host = process.env.NAVI_E5_PGHOST ?? '127.0.0.1'
const port = Number(process.env.NAVI_E5_PGPORT ?? '55433')
const database = process.env.NAVI_E5_PGDATABASE ?? 'navi_e5_admin'
const user = process.env.NAVI_E5_PGUSER ?? 'navi_e5_admin'
const passwordFile = process.env.NAVI_E5_PASSWORD_FILE

if (host !== '127.0.0.1' || port !== 55433 || database !== 'navi_e5_admin' || user !== 'navi_e5_admin') {
  throw new Error('E5 preflight accepts only the expected loopback bootstrap identity.')
}
if (!passwordFile) throw new Error('NAVI_E5_PASSWORD_FILE must point to the protected local secret file.')

const password = readFileSync(passwordFile, 'utf8')
const client = new Client({ host, port, database, user, password, connectionTimeoutMillis: 3000 })

try {
  await client.connect()
  const identity = await client.query(`
    SELECT current_database() AS database,
           session_user AS role,
           inet_server_addr()::text AS server_address,
           current_setting('server_version') AS version,
           current_setting('server_version_num')::integer AS version_num
  `)
  const databases = await client.query(`
    SELECT datname
    FROM pg_database
    WHERE NOT datistemplate
    ORDER BY datname
  `)
  const targetState = await client.query(`
    SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'navi_e4_test') AS e4_database_exists,
           EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'navi_e4_runner') AS runner_role_exists,
           (SELECT count(*)::integer
            FROM pg_catalog.pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) AS application_table_count
  `)

  const result = {
    host,
    port,
    identity: identity.rows[0],
    databases: databases.rows.map((row) => row.datname),
    targetState: targetState.rows[0],
  }

  if (
    result.identity.database !== 'navi_e5_admin' ||
    result.identity.role !== 'navi_e5_admin' ||
    result.identity.version_num < 170000 ||
    result.identity.version_num >= 180000 ||
    result.targetState.e4_database_exists ||
    result.targetState.runner_role_exists
  ) {
    throw new Error(`E5 pre-migration identity/data precondition failed: ${JSON.stringify(result)}`)
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  await client.end().catch(() => {})
}
