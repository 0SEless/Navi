// Safety guard for the Save v2 disposable test database.
// Any script or test that resets/mutates this database must call
// assertSaveV2TestTarget(client) first.

import { readFileSync } from 'node:fs'
import path from 'node:path'

export const SAVE_V2_HOST = '127.0.0.1'
export const SAVE_V2_PORT = 55434
export const SAVE_V2_DATABASE = 'navi_savev2_test'
export const SAVE_V2_MARKER = 'navi-savev2-synthetic-v1'

export function passwordFilePath() {
  const base = process.env.LOCALAPPDATA
  if (!base) throw new Error('LOCALAPPDATA is not set; cannot locate pg-password.txt')
  return path.join(base, 'navi-savev2', 'pg-password.txt')
}

export function readPassword() {
  return readFileSync(passwordFilePath(), 'utf8').trim()
}

/** Connection settings for pg.Client. Host/port/database are fixed, never from env. */
export function saveV2ConnectionConfig() {
  return {
    host: SAVE_V2_HOST,
    port: SAVE_V2_PORT,
    database: SAVE_V2_DATABASE,
    user: 'postgres',
    password: readPassword(),
  }
}

/**
 * Throws unless the connected client is the Save v2 disposable database:
 * host 127.0.0.1, port 55434, and the database comment carries the marker.
 * Never prints connection secrets.
 */
export async function assertSaveV2TestTarget(client) {
  const host = client.host ?? client.connectionParameters?.host
  const port = Number(client.port ?? client.connectionParameters?.port)
  if (host !== SAVE_V2_HOST) {
    throw new Error(`Refusing: host is "${host}", expected ${SAVE_V2_HOST}`)
  }
  if (port !== SAVE_V2_PORT) {
    throw new Error(`Refusing: port is ${port}, expected ${SAVE_V2_PORT}`)
  }
  const { rows } = await client.query(
    `SELECT current_database() AS db,
            shobj_description(d.oid, 'pg_database') AS marker
       FROM pg_database d WHERE d.datname = current_database()`,
  )
  const row = rows[0]
  if (!row || row.db !== SAVE_V2_DATABASE) {
    throw new Error(`Refusing: database is "${row?.db}", expected ${SAVE_V2_DATABASE}`)
  }
  if (row.marker !== SAVE_V2_MARKER) {
    throw new Error(`Refusing: database comment marker is not "${SAVE_V2_MARKER}"`)
  }
}
