// Shared helper: turn a vitest JSON report into sorted
// "<repo-relative test file, forward slashes> > <full test name>" lines
// for every passed test.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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
