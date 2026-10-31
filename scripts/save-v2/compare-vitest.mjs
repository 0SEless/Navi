#!/usr/bin/env node
// Regression gate for the vitest suite.
//
//   node scripts/save-v2/compare-vitest.mjs <baseline-passed.txt> <current-vitest.json>
//     Exit 1 when any line in the baseline is not a passed test in the current
//     run and is not listed in scripts/save-v2/retired-tests.json.
//
//   node scripts/save-v2/compare-vitest.mjs --emit <vitest.json> <out-passed.txt>
//     Write the sorted "<repo-relative file> > <full test name>" list of every
//     passed test (used once to create the committed baseline).
//
// Line format: "<repo-relative test file, forward slashes> > <full test name>".

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const MAX_LISTED = 50

function toRelative(file) {
  const rel = path.isAbsolute(file) ? path.relative(repoRoot, file) : file
  return rel.split(path.sep).join('/')
}

export function passedLines(vitestJson) {
  const lines = []
  for (const suite of vitestJson.testResults ?? []) {
    const file = toRelative(suite.name)
    for (const t of suite.assertionResults ?? []) {
      if (t.status === 'passed') lines.push(`${file} > ${t.fullName}`)
    }
  }
  return lines.sort()
}

function usage() {
  console.error(
    'usage: compare-vitest.mjs <baseline-passed.txt> <current-vitest.json>\n' +
      '       compare-vitest.mjs --emit <vitest.json> <out-passed.txt>',
  )
  process.exit(2)
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--emit') {
    const [, jsonPath, outPath] = args
    if (!jsonPath || !outPath) usage()
    const lines = passedLines(JSON.parse(readFileSync(jsonPath, 'utf8')))
    writeFileSync(outPath, lines.join('\n') + '\n')
    console.log(`wrote ${lines.length} passed tests to ${outPath}`)
    return 0
  }

  const [baselinePath, currentPath] = args
  if (!baselinePath || !currentPath) usage()

  // Unique lines: a few tests share a name within one file.
  const baseline = [
    ...new Set(
      readFileSync(baselinePath, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.length > 0),
    ),
  ]
  const current = new Set(passedLines(JSON.parse(readFileSync(currentPath, 'utf8'))))
  const retired = new Set(
    JSON.parse(readFileSync(path.join(here, 'retired-tests.json'), 'utf8')).map((r) => r.test),
  )

  const missing = []
  let retiredCount = 0
  for (const line of baseline) {
    if (current.has(line)) continue
    if (retired.has(line)) {
      retiredCount++
      continue
    }
    missing.push(line)
  }

  console.log(
    `baseline passed: ${baseline.length}  current passed: ${current.size}  ` +
      `retired: ${retiredCount}  regressed: ${missing.length}`,
  )
  if (missing.length > 0) {
    console.error(`FAIL: ${missing.length} baseline test(s) no longer pass:`)
    for (const l of missing.slice(0, MAX_LISTED)) console.error(`  ${l}`)
    if (missing.length > MAX_LISTED) console.error(`  ... and ${missing.length - MAX_LISTED} more`)
    return 1
  }
  console.log('OK: no baseline test regressed')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
