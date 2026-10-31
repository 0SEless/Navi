// Database test harness for Save v2. Test-only: it connects to the disposable
// local Postgres (127.0.0.1:55434, marker navi-savev2-synthetic-v1) and nothing else.
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { resetSaveV2Database } from '../../../scripts/save-v2/db-reset.mjs'
import {
  SAVE_V2_DATABASE,
  SAVE_V2_HOST,
  SAVE_V2_PORT,
  assertSaveV2TestTarget,
  saveV2ConnectionConfig,
} from '../../../scripts/save-v2/db-target.mjs'

export type TestDbClient = Awaited<ReturnType<Pool['connect']>>

const RUNNER_ROLE = 'navi_savev2_runner'

let adminPool: Pool | null = null
let runnerPool: Pool | null = null
let runnerPassword: string | null = null
let ready: Promise<void> | null = null

function getAdminPool(): Pool {
  adminPool ??= new Pool({ ...saveV2ConnectionConfig(), max: 3 })
  return adminPool
}

function getRunnerPool(): Pool {
  if (!runnerPassword) throw new Error('Test harness is not prepared yet.')
  runnerPool ??= new Pool({
    host: SAVE_V2_HOST,
    port: SAVE_V2_PORT,
    database: SAVE_V2_DATABASE,
    user: RUNNER_ROLE,
    password: runnerPassword,
    max: 3,
  })
  return runnerPool
}

/** Guard, drop schema studio, apply the migration. Roles survive; they are cluster-level. */
export async function resetStudioSchema(): Promise<void> {
  await resetSaveV2Database()
}

async function prepare(): Promise<void> {
  await resetStudioSchema()
  // A fresh random password per process; it is never printed or stored.
  // Hex only, so embedding it as a SQL literal is safe.
  runnerPassword = randomBytes(24).toString('hex')
  const admin = await getAdminPool().connect()
  try {
    await assertSaveV2TestTarget(admin)
    await admin.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNNER_ROLE}') THEN
          CREATE ROLE ${RUNNER_ROLE} LOGIN;
        END IF;
      END
      $$`)
    await admin.query(`ALTER ROLE ${RUNNER_ROLE} LOGIN PASSWORD '${runnerPassword}'`)
    await admin.query(`GRANT navi_studio_api TO ${RUNNER_ROLE}`)
  } finally {
    admin.release()
  }
}

/**
 * Runs fn with `client` (login role navi_savev2_runner, a member of navi_studio_api)
 * and `admin` (guarded superuser connection for setup and inspection).
 * The schema is reset once per test file, not per test.
 */
export async function withTestDb(
  fn: (client: TestDbClient, admin: TestDbClient) => Promise<void>,
): Promise<void> {
  ready ??= prepare()
  try {
    await ready
  } catch (error) {
    ready = null
    throw error
  }
  const admin = await getAdminPool().connect()
  let client: TestDbClient | null = null
  try {
    client = await getRunnerPool().connect()
    await assertSaveV2TestTarget(admin)
    await assertSaveV2TestTarget(client)
    await fn(client, admin)
  } finally {
    client?.release()
    admin.release()
  }
}

/** Close both pools. Call from afterAll in each test file. */
export async function closeTestDb(): Promise<void> {
  const pools = [runnerPool, adminPool]
  runnerPool = null
  adminPool = null
  runnerPassword = null
  ready = null
  await Promise.all(pools.map((pool) => pool?.end()))
}
