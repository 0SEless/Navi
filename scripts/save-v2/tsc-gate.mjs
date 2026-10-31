#!/usr/bin/env node
// Type-check gate.
//   node scripts/save-v2/tsc-gate.mjs
// Runs `tsc --noEmit -p .`, then fails when
//   - the number of "error TS" diagnostics exceeds reports/save-v2/baseline-tsc.txt, or
//   - any diagnostic is located under src/studio-v2/ (new code must be clean).

import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const baseline = Number.parseInt(
  readFileSync(path.join(repoRoot, 'reports', 'save-v2', 'baseline-tsc.txt'), 'utf8').trim(),
  10,
)
if (!Number.isInteger(baseline)) {
  console.error('FAIL: reports/save-v2/baseline-tsc.txt does not contain an integer')
  process.exit(2)
}

const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const run = spawnSync(process.execPath, [tsc, '--noEmit', '-p', '.'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
})
if (run.error) {
  console.error(`FAIL: could not run tsc: ${run.error.message}`)
  process.exit(2)
}

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
const rawDir = path.join(repoRoot, 'reports', 'save-v2', 'raw')
mkdirSync(rawDir, { recursive: true })
writeFileSync(path.join(rawDir, 'tsc-last-run.txt'), output)

const errorLines = output.split(/\r?\n/).filter((l) => l.includes('error TS'))
const studioV2 = errorLines.filter((l) => l.replace(/\\/g, '/').startsWith('src/studio-v2/'))

console.log(`tsc errors: ${errorLines.length}  baseline: ${baseline}  under src/studio-v2/: ${studioV2.length}`)

let failed = false
if (errorLines.length > baseline) {
  console.error(`FAIL: ${errorLines.length - baseline} more type error(s) than the baseline`)
  failed = true
}
if (studioV2.length > 0) {
  console.error('FAIL: diagnostics under src/studio-v2/:')
  for (const l of studioV2.slice(0, 50)) console.error(`  ${l}`)
  failed = true
}
if (!failed) console.log('OK: type-check gate passed')
process.exit(failed ? 1 : 0)
