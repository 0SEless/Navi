/**
 * One-time import: old ASU Ibajay map (navi-development, read only) + trial campus terrain
 * -> new Save v2 campus. Spec: docs/superpowers/specs/2026-11-12-navi-old-map-import-with-trial-terrain.md
 *
 *   npx tsx scripts/save-v2/import-old-map.ts export
 *   npx tsx scripts/save-v2/import-old-map.ts dry-run
 *   npx tsx scripts/save-v2/import-old-map.ts apply --actor <owner user id>
 *
 * Env: NAVI_OLD_SUPABASE_URL, NAVI_OLD_SUPABASE_SERVICE_KEY (old project, select only),
 *      NAVI_STUDIO_DATABASE_URL, NAVI_STUDIO_ALLOWED_DB_REF (Save v2). Values are never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { applyImport, ownerActorProblem } from '../../src/studio-v2/import/old-map/apply'
import { campusSettings, dryRun, renderReport } from '../../src/studio-v2/import/old-map/dry-run'
import { exportHash, readOldMap, readTrialTerrain } from '../../src/studio-v2/import/old-map/read-sources'
import type { DryRunReport, OldMapExport, TrialTerrainExport } from '../../src/studio-v2/import/old-map/types'
import { createStudioHandlers } from '../../src/studio-v2/server/handlers'
import { getStudioPool } from '../../src/studio-v2/server/studio-db'
import { createStudioRepo } from '../../src/studio-v2/server/studio-repo'

const OLD_CAMPUS = 'map-map-1-repe'
const TRIAL_CAMPUS = 'map-map-5-0y27'
const TARGET_CAMPUS = 'map-asu-ibajay-imported'
const TARGET_NAME = 'ASU Ibajay (imported)'
const MESSAGE = 'Import old ASU Ibajay map (map-map-1-repe) with trial terrain'

const DIR = path.join('scripts', 'save-v2', 'import-data')
const OLD_FILE = path.join(DIR, 'old-map.json')
const TRIAL_FILE = path.join(DIR, 'trial-terrain.json')
const MEMBERS_FILE = path.join(DIR, 'trial-members.json')
const REPORT_MD = path.join(DIR, 'dry-run-report.md')
const REPORT_JSON = path.join(DIR, 'dry-run-report.json')

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

async function exportSources(): Promise<void> {
  const old = createClient(env('NAVI_OLD_SUPABASE_URL'), env('NAVI_OLD_SUPABASE_SERVICE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const pool = getStudioPool()
  try {
    const oldMap = await readOldMap(old, OLD_CAMPUS)
    const trial = await readTrialTerrain(pool, TRIAL_CAMPUS)
    const members = await pool.query('SELECT user_id, role FROM studio.members WHERE campus_id = $1', [TRIAL_CAMPUS])
    mkdirSync(DIR, { recursive: true })
    writeFileSync(OLD_FILE, JSON.stringify(oldMap))
    writeFileSync(TRIAL_FILE, JSON.stringify(trial))
    writeFileSync(MEMBERS_FILE, JSON.stringify(members.rows, null, 2))
    console.log(`Exported ${OLD_FILE} and ${TRIAL_FILE} (${trial.tiles.length} terrain tiles).`)
  } finally {
    await pool.end()
  }
}

async function readExports(): Promise<{ old: OldMapExport; trial: TrialTerrainExport; hash: string }> {
  const oldJson = readFileSync(OLD_FILE, 'utf8')
  const trialJson = readFileSync(TRIAL_FILE, 'utf8')
  return { old: JSON.parse(oldJson), trial: JSON.parse(trialJson), hash: await exportHash(oldJson, trialJson) }
}

async function runDryRun(): Promise<number> {
  const { old, trial, hash } = await readExports()
  const { report } = dryRun(old, trial, hash)
  const members = existsSync(MEMBERS_FILE) ? readFileSync(MEMBERS_FILE, 'utf8') : '[]'
  writeFileSync(REPORT_MD, `${renderReport(report)}\n## Trial campus owners (for --actor)\n\n\`\`\`json\n${members}\n\`\`\`\n`)
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2))
  console.log(`${report.ok ? 'OK' : 'STOPPED'}: report written to ${REPORT_MD}`)
  return report.ok ? 0 : 1
}

async function runApply(args: string[]): Promise<number> {
  const actorIndex = args.indexOf('--actor')
  const actor = actorIndex >= 0 ? args[actorIndex + 1] : undefined
  if (!actor) throw new Error('apply needs --actor <owner user id> (see the dry-run report).')
  if (!existsSync(REPORT_JSON)) throw new Error('No dry-run report: run dry-run first.')
  const saved = JSON.parse(readFileSync(REPORT_JSON, 'utf8')) as DryRunReport
  const { old, trial, hash } = await readExports()
  if (!saved.ok) throw new Error('The dry-run report is not OK: fix its problems first.')
  if (saved.exportHash !== hash) throw new Error('The export files changed since the dry run: run dry-run again.')
  const members = JSON.parse(readFileSync(MEMBERS_FILE, 'utf8')) as Array<{ user_id: string; role: string }>
  const actorProblem = ownerActorProblem(actor, members)
  if (actorProblem) throw new Error(actorProblem)

  const { report, parts } = dryRun(old, trial, hash)
  if (!report.ok) throw new Error('The dry run no longer passes: run dry-run again.')

  const pool = getStudioPool()
  try {
    const handlers = createStudioHandlers({
      repo: createStudioRepo(pool),
      verifyPrincipal: async () => ({ ok: true, principal: { id: actor, email: null, role: 'campus_admin', method: 'import-script' } }),
    })
    const result = await applyImport({ handlers, campusId: TARGET_CAMPUS, name: TARGET_NAME, settings: campusSettings(old), parts, message: MESSAGE })
    if (result.ok) {
      console.log(`Imported ${result.savedParts} parts into ${TARGET_CAMPUS} (commit ${result.commit}).`)
      return 0
    }
    console.error(`Import stopped at ${result.stage} (HTTP ${result.status}):`, JSON.stringify(result.body))
    if (result.createdEmptyCampus) console.error(`The campus ${TARGET_CAMPUS} was created but is empty; delete it in Studio before retrying.`)
    return 1
  } finally {
    await pool.end()
  }
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'export') return exportSources().then(() => 0)
  if (command === 'dry-run') return runDryRun()
  if (command === 'apply') return runApply(args)
  console.error('Usage: import-old-map.ts export | dry-run | apply --actor <owner user id>')
  return 2
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message)
    process.exit(1)
  },
)
