// Server-only database access for Save v2.
//
// The one place that opens a connection to the Save v2 database. Every connection is
// checked by assertStudioDatabaseTarget first, which makes it impossible to connect to
// the protected Development Supabase project and refuses any host that is not the local
// test database or the project explicitly named in NAVI_STUDIO_ALLOWED_DB_REF.
import { Pool } from 'pg'

/** Project ref of the protected Development Supabase project. Never connect to it. */
const PROTECTED_DEV_PROJECT_REF = 'scvgulusmutnzasmgysx'

const LOCAL_TEST_HOST = '127.0.0.1'
const LOCAL_TEST_PORT = '55434'
const LOCAL_TEST_DATABASE = 'navi_savev2_test'
const SUPABASE_REF_PATTERN = /^[a-z0-9]{20}$/

type Env = Record<string, string | undefined>

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function mentionsProtectedProject(rawUrl: string, parsed: URL | null): boolean {
  const candidates = [rawUrl, safeDecode(rawUrl)]
  if (parsed) {
    for (const part of [parsed.hostname, parsed.username, parsed.password, parsed.pathname, parsed.search]) {
      candidates.push(part, safeDecode(part))
    }
  }
  return candidates.some((candidate) => candidate.toLowerCase().includes(PROTECTED_DEV_PROJECT_REF))
}

function parseDatabaseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/**
 * Throws unless `url` is an allowed Save v2 database:
 *  (a) the local test database 127.0.0.1:55434/navi_savev2_test, or
 *  (b) a host or pooler user name that carries env.NAVI_STUDIO_ALLOWED_DB_REF
 *      (20 lowercase alphanumerics), as a dot-separated host label or as the
 *      `.<ref>` suffix of the user name (postgres.<ref> on *.pooler.supabase.com).
 * The protected Development project is refused in every case, even when the allowed
 * ref names it. Error messages never contain the user name or the password.
 */
export function assertStudioDatabaseTarget(url: string, env: Env = process.env): void {
  const raw = typeof url === 'string' ? url : ''
  const parsed = parseDatabaseUrl(raw)

  if (mentionsProtectedProject(raw, parsed)) {
    throw new Error('Refusing database target: it points at the protected Development Supabase project.')
  }
  if (!parsed) {
    throw new Error('Refusing database target: the URL cannot be parsed.')
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('Refusing database target: the URL is not a postgres:// URL.')
  }

  const host = parsed.hostname.toLowerCase()
  const database = safeDecode(parsed.pathname.replace(/^\//, ''))

  if (host === LOCAL_TEST_HOST && parsed.port === LOCAL_TEST_PORT && database === LOCAL_TEST_DATABASE) {
    return
  }

  const allowedRef = env.NAVI_STUDIO_ALLOWED_DB_REF
  if (!allowedRef) {
    throw new Error(
      `Refusing database target "${host}": only the local test database is allowed unless NAVI_STUDIO_ALLOWED_DB_REF names the project.`,
    )
  }
  if (!SUPABASE_REF_PATTERN.test(allowedRef)) {
    throw new Error('Refusing database target: NAVI_STUDIO_ALLOWED_DB_REF must be 20 lowercase letters or digits.')
  }

  const hostHasRef = host.split('.').includes(allowedRef)
  const userHasRef = safeDecode(parsed.username).endsWith(`.${allowedRef}`)
  if (!hostHasRef && !userHasRef) {
    throw new Error(`Refusing database target "${host}": it does not belong to the project in NAVI_STUDIO_ALLOWED_DB_REF.`)
  }
}

let pool: Pool | null = null

function isLocalTestTarget(parsed: URL): boolean {
  return (
    parsed.hostname.toLowerCase() === LOCAL_TEST_HOST &&
    parsed.port === LOCAL_TEST_PORT &&
    safeDecode(parsed.pathname.replace(/^\//, '')) === LOCAL_TEST_DATABASE
  )
}

/**
 * The one Save v2 connection pool. Server only (throws in a browser), created lazily,
 * after the target guard has accepted NAVI_STUDIO_DATABASE_URL. Connection settings are
 * taken from the URL parts that were checked; query parameters such as sslmode are
 * ignored, so the URL cannot switch TLS off. No named prepared statements are used
 * anywhere (Supabase transaction pooler).
 */
export function getStudioPool(): Pool {
  if (typeof window !== 'undefined') {
    throw new Error('getStudioPool is server-only and must not run in a browser.')
  }
  if (pool) return pool

  const url = process.env.NAVI_STUDIO_DATABASE_URL
  if (!url) {
    throw new Error('NAVI_STUDIO_DATABASE_URL is not set; Save v2 cannot reach its database.')
  }
  assertStudioDatabaseTarget(url, process.env)
  const parsed = new URL(url)

  const created = new Pool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: safeDecode(parsed.username),
    password: safeDecode(parsed.password),
    database: safeDecode(parsed.pathname.replace(/^\//, '')),
    application_name: 'navi-studio-v2',
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ...(isLocalTestTarget(parsed)
      ? {}
      : {
          ssl: {
            rejectUnauthorized: true,
            ...(process.env.NAVI_STUDIO_DB_CA_PEM ? { ca: process.env.NAVI_STUDIO_DB_CA_PEM } : {}),
          },
        }),
  })
  // An idle client can error (for example when the database restarts); without a
  // listener that would crash the process. Log the code only: messages can echo secrets.
  created.on('error', (error) => {
    const code = (error as { code?: unknown }).code
    console.error('[studio-db] idle pool client error', typeof code === 'string' ? code : error.name)
  })
  pool = created
  return pool
}
