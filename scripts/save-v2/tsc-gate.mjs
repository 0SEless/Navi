#!/usr/bin/env node
// Type-check gate.
//   node scripts/save-v2/tsc-gate.mjs
// Runs `tsc --noEmit -p .`, then fails when
//   - the number of "error TS" diagnostics exceeds reports/save-v2/baseline-tsc.txt, or
//   - any diagnostic is located under a clean folder (src/studio-v2/ and the terrain plan's folders).

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

// Fail closed. tsc exits 0 (clean) or 1/2 (ran, found diagnostics; 1 with
// --noEmit). A crash such as "Cannot find module" also exits 1, so a non-zero
// status additionally needs at least one parsed "error TS" line.
if (run.status !== 0 && run.status !== 1 && run.status !== 2) {
  console.error(`FAIL: tsc did not run to completion (exit status ${run.status}, signal ${run.signal}); gate cannot pass.`)
  console.error(output.split(/\r?\n/).slice(0, 10).join('\n'))
  process.exit(2)
}
if (run.status !== 0 && errorLines.length === 0) {
  console.error(`FAIL: tsc exited ${run.status} but no "error TS" diagnostics were parsed; refusing to treat as a pass.`)
  console.error(output.split(/\r?\n/).slice(0, 10).join('\n'))
  process.exit(2)
}

// New code must be clean: Save v2 and the terrain plan's folders.
const CLEAN_PATHS = [
  'src/studio-v2/',
  'packages/core/src/terrain/',
  'packages/core/src/structures/',
  'src/components/terrain/',
  'src/lib/terrain/',
  'src/lib/three-d/',
]
const studioV2 = errorLines.filter((l) => CLEAN_PATHS.some((prefix) => l.replace(/\\/g, '/').startsWith(prefix)))

console.log(`tsc errors: ${errorLines.length}  baseline: ${baseline}  in clean folders: ${studioV2.length}`)

let failed = false
if (errorLines.length > baseline) {
  console.error(`FAIL: ${errorLines.length - baseline} more type error(s) than the baseline`)
  failed = true
}
if (studioV2.length > 0) {
  console.error('FAIL: diagnostics in clean folders (' + CLEAN_PATHS.join(', ') + '):')
  for (const l of studioV2.slice(0, 50)) console.error(`  ${l}`)
  failed = true
}
if (!failed) console.log('OK: type-check gate passed')
process.exit(failed ? 1 : 0)
