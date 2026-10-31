import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureLegacyShape, fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { joinParts } from './join'
import { splitDocument } from './split'

/** Clock-derived fields the compiler stamps into its output. Nothing else is stripped. */
const VOLATILE_KEYS = new Set(['createdAt', 'compiledAt', 'exportedAt'])

function stripVolatile<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripVolatile) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEYS.has(key)) continue
      out[key] = stripVolatile(child)
    }
    return out as T
  }
  return value
}

/**
 * The compiler keeps module-level monotonic id counters (N-1, E-1, W-1, ...) that are never reset, so
 * node/edge ids and the graph checksum depend on how many compiles ran earlier in the same process.
 * To compare like with like, every compile runs against a freshly loaded compiler module (counters at
 * zero), exactly as a fresh process would. The compiler itself is not modified.
 */
async function compile(doc: CampusDocument) {
  vi.resetModules()
  const { CampusCompiler } = await import('@navi/compiler')
  const result = new CampusCompiler().compileV2(doc)
  return stripVolatile({
    success: result.success,
    graph: result.graph,
    artifacts: result.artifacts,
    stats: result.stats,
    errors: result.errors,
    warnings: result.warnings,
  })
}

/** Joined the way the real loader produces it: metadata via opts, version restored by the caller. */
function roundTrip(doc: CampusDocument, restoreVolatile: boolean): CampusDocument {
  const { parts, localReferences } = splitDocument(doc)
  if (!restoreVolatile) return joinParts(parts, localReferences)
  const joined = joinParts(parts, localReferences, {
    lastModified: doc.metadata.lastModified,
    editorVersion: doc.metadata.editorVersion,
  })
  joined.version = doc.version
  return joined
}

const FIXTURES = [
  ['fixtureMinimal', fixtureMinimal],
  ['fixtureFull', fixtureFull],
  ['fixtureLegacyShape', fixtureLegacyShape],
] as const

type Compiled = Awaited<ReturnType<typeof compile>>
const artifactMeta = (c: Compiled) =>
  (c.artifacts as unknown as { metadata: { revision: string; sourceDocumentVersion: string } }).metadata

describe('compiler parity through split/join (published output must not change)', () => {
  it.each(FIXTURES)('%s compiles identically before and after split/join', async (_name, make) => {
    const original = await compile(make())
    const joined = await compile(roundTrip(make(), true))

    expect(original.success).toBe(true)
    expect(joined).toEqual(original)
  })

  // Join resets version/lastModified/editorVersion (ruling R3). The compiler reads only document.version,
  // and only into artifacts.metadata.revision / sourceDocumentVersion (publish stamps its own revision).
  // Everything else must be identical even when nothing is restored.
  it.each(FIXTURES)(
    '%s: without restoring version/lastModified/editorVersion only the version-derived stamps differ',
    async (_name, make) => {
      const original = await compile(make())
      const joined = await compile(roundTrip(make(), false))
      expect(artifactMeta(original).revision).toBe(String(make().version))
      expect(artifactMeta(joined).revision).toBe('0')
      for (const c of [original, joined]) {
        artifactMeta(c).revision = 'X'
        artifactMeta(c).sourceDocumentVersion = 'X'
      }
      expect(joined).toEqual(original)
    },
  )
})
