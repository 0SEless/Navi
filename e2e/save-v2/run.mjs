#!/usr/bin/env node
// Save v2 browser probe runner (Task 18).
//   node e2e/save-v2/run.mjs [playwright args…]
// 1. Guard + reset the disposable local database (127.0.0.1:55434, marker checked).
// 2. Give a throwaway login role a fresh random password (never printed) and make it a
//    member of navi_studio_api, exactly what the deployed API role can do.
// 3. Run Playwright; the dev server it starts reaches only that local database.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { resetSaveV2Database } from '../../scripts/save-v2/db-reset.mjs'
import { SAVE_V2_DATABASE, SAVE_V2_HOST, SAVE_V2_PORT, assertSaveV2TestTarget, saveV2ConnectionConfig } from '../../scripts/save-v2/db-target.mjs'

const ROLE = 'navi_savev2_e2e'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

await resetSaveV2Database()
const password = randomBytes(24).toString('hex')
const admin = new pg.Client(saveV2ConnectionConfig())
await admin.connect()
try {
  await assertSaveV2TestTarget(admin)
  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN; END IF; END $$`)
  // Hex only, so the literal is safe.
  await admin.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD '${password}'`)
  await admin.query(`GRANT navi_studio_api TO ${ROLE}`)
} finally {
  await admin.end()
}

const databaseUrl = `postgres://${ROLE}:${password}@${SAVE_V2_HOST}:${SAVE_V2_PORT}/${SAVE_V2_DATABASE}`
const cli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const child = spawn(process.execPath, [cli, 'test', '-c', 'e2e/save-v2/playwright.save-v2.config.ts', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, NAVI_STUDIO_DATABASE_URL: databaseUrl },
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1
})
