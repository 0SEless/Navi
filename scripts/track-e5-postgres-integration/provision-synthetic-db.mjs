import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const host = process.env.NAVI_E5_PGHOST ?? '127.0.0.1'
const port = Number(process.env.NAVI_E5_PGPORT ?? '55433')
const adminPasswordFile = process.env.NAVI_E5_ADMIN_PASSWORD_FILE
const runnerPasswordFile = process.env.NAVI_E5_RUNNER_PASSWORD_FILE

if (host !== '127.0.0.1' || port !== 55433) {
  throw new Error('Provisioning is restricted to the E5 localhost endpoint.')
}
if (!adminPasswordFile || !runnerPasswordFile) {
  throw new Error('Protected E5 admin and runner password file paths are required.')
}

const adminPassword = readFileSync(adminPasswordFile, 'utf8')
const runnerPassword = readFileSync(runnerPasswordFile, 'utf8')
if (!/^[A-Za-z0-9+/=]{64}$/.test(adminPassword) || !/^[A-Za-z0-9+/=]{64}$/.test(runnerPassword)) {
  throw new Error('E5 secret file format does not match the generated synthetic credentials.')
}

const admin = new Client({
  host,
  port,
  database: 'navi_e5_admin',
  user: 'navi_e5_admin',
  password: adminPassword,
  connectionTimeoutMillis: 3000,
})

try {
  await admin.connect()
  const before = await admin.query(`
    SELECT current_database() AS database,
           session_user AS role,
           current_setting('server_version_num')::integer AS version_num,
           EXISTS (SELECT 1 FROM pg_database WHERE datname = 'navi_e4_test') AS database_exists,
           EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'navi_e4_runner') AS runner_exists,
           EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) AS supabase_role_exists
  `)
  const state = before.rows[0]
  if (
    state.database !== 'navi_e5_admin' ||
    state.role !== 'navi_e5_admin' ||
    state.version_num < 170000 ||
    state.version_num >= 180000 ||
    state.database_exists ||
    state.runner_exists ||
    state.supabase_role_exists
  ) {
    throw new Error('E5 database/role creation preflight failed; no objects were created.')
  }

  const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`
  await admin.query(
    `CREATE ROLE navi_e4_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${quoteLiteral(runnerPassword)}`,
  )
  await admin.query('CREATE DATABASE navi_e4_test OWNER navi_e4_runner TEMPLATE template0')
  await admin.query("COMMENT ON DATABASE navi_e4_test IS 'navi-e4-synthetic-v1'")

  const runner = new Client({
    host,
    port,
    database: 'navi_e4_test',
    user: 'navi_e4_runner',
    password: runnerPassword,
    connectionTimeoutMillis: 3000,
  })
  try {
    await runner.connect()
    const verified = await runner.query(`
      SELECT current_database() AS database,
             session_user AS role,
             inet_server_addr()::text AS server_address,
             current_setting('server_version') AS version,
             current_setting('server_version_num')::integer AS version_num,
             pg_get_userbyid(d.datdba) AS database_owner,
             shobj_description(d.oid, 'pg_database') AS database_comment,
             r.rolsuper AS superuser,
             r.rolcreatedb AS create_database,
             r.rolcreaterole AS create_role,
             r.rolbypassrls AS bypass_rls,
             has_database_privilege(session_user, current_database(), 'CREATE') AS database_create,
             to_regnamespace('navi_scoped') IS NOT NULL AS schema_exists,
             EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) AS supabase_role_exists
      FROM pg_database d
      JOIN pg_roles r ON r.rolname = session_user
      WHERE d.datname = current_database()
    `)
    const identity = verified.rows[0]
    if (
      identity.database !== 'navi_e4_test' ||
      identity.role !== 'navi_e4_runner' ||
      identity.database_owner !== 'navi_e4_runner' ||
      identity.database_comment !== 'navi-e4-synthetic-v1' ||
      identity.version_num < 170000 ||
      identity.version_num >= 180000 ||
      identity.superuser ||
      identity.create_database ||
      identity.create_role ||
      identity.bypass_rls ||
      !identity.database_create ||
      identity.schema_exists ||
      identity.supabase_role_exists
    ) {
      throw new Error('Created E5 database identity/least-privilege preflight failed.')
    }
    process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`)
  } finally {
    await runner.end().catch(() => {})
  }
} finally {
  await admin.end().catch(() => {})
}
