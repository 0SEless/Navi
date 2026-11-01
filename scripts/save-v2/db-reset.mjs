#!/usr/bin/env node
// Reset the Save v2 disposable test database.
//   node scripts/save-v2/db-reset.mjs
// Verifies host/port/database/marker, drops schema "studio", then applies
// supabase/migrations/20261101000000_studio_v2.sql when that file exists.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { assertSaveV2TestTarget, saveV2ConnectionConfig } from './db-target.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '20261101000000_studio_v2.sql')

const LATER_MIGRATION = new RegExp('^[0-9]{14}_studio_v2_[a-z0-9_]+[.]sql$')

function isLaterStudioMigration(name) {
  return LATER_MIGRATION.test(name)
}

export async function resetSaveV2Database() {
  const client = new pg.Client(saveV2ConnectionConfig())
  await client.connect()
  try {
    await assertSaveV2TestTarget(client)
    console.log('guard passed: 127.0.0.1:55434 / navi_savev2_test / marker ok')
    await client.query('DROP SCHEMA IF EXISTS studio CASCADE')
    console.log('dropped schema studio (if it existed)')
    if (!existsSync(migrationPath)) {
      console.log('migration not present yet')
      return
    }
    await client.query(readFileSync(migrationPath, 'utf8'))
    console.log('applied 20261101000000_studio_v2.sql')
    // Later Save v2 migrations, in file-name order (the same order they reach the cloud project).
    for (const file of readdirSync(path.dirname(migrationPath)).filter(isLaterStudioMigration).sort()) {
      await client.query(readFileSync(path.join(path.dirname(migrationPath), file), 'utf8'))
      console.log(`applied ${file}`)
    }
  } finally {
    await client.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  resetSaveV2Database().catch((err) => {
    console.error(`db-reset failed: ${err.message}`)
    process.exit(1)
  })
}
