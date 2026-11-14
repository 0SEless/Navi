import { describe, expect, it } from 'vitest'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import { fixtureFull } from '@/studio-v2/__fixtures__/campus-fixtures'
import { canonicalJson } from '@/studio-v2/parts/canonical'

/** Decorative keys the emitter deliberately passes through for rendering; never routing inputs. */
const DECORATIVE_KEYS = new Set(['doorAppearance', 'doorPose', 'doorOperation', 'hingeSide', 'swingSide', 'windowAppearance', 'assetPreset', 'material', 'glass', 'windowPose',
  // Per-compile volatile values, not navigation content.
  'createdAt', 'generatedAt', 'compiledAt'])
const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !DECORATIVE_KEYS.has(k)).map(([k, v]) => [k, strip(v)])) : value

function styled(): { doc: CampusDocument; touched: number } {
  const doc = fixtureFull() as unknown as CampusDocument
  let touched = 0
  const style = (d: Record<string, unknown>) => { Object.assign(d, { doorAppearance: 'glass', doorPose: 'open', doorOperation: 'sliding', hingeSide: 'end', swingSide: 'right' }); touched++ }
  for (const b of doc.buildings) for (const f of b.floors as any[]) {
    for (const d of f.doors ?? []) style(d)
    for (const r of f.rooms ?? []) for (const d of r.roomDoors ?? []) style(d)
    for (const o of f.openings ?? []) if (o.type === 'door') style(o); else if (o.type === 'window') { o.windowAppearance = 'two-pane'; touched++ }
  }
  return { doc, touched }
}
const compile = (doc: CampusDocument) => new CampusCompiler().compileV2(doc) as any

describe('appearance fields are visual only', () => {
  it('compiled navigation graph and artifacts are identical when only appearance fields change', () => {
    const plain = compile(fixtureFull() as unknown as CampusDocument)
    const { doc, touched } = styled()
    expect(touched).toBeGreaterThan(0)
    const dressed = compile(doc)
    expect(canonicalJson(strip(dressed.graph))).toBe(canonicalJson(strip(plain.graph)))
    expect(canonicalJson(strip(dressed.artifacts))).toBe(canonicalJson(strip(plain.artifacts)))
  })

  it('published floor data carries hinge, swing and operation for rendering', () => {
    const text = JSON.stringify(compile(styled().doc).artifacts)
    expect(text).toContain('"hingeSide":"end"')
    expect(text).toContain('"swingSide":"right"')
    expect(text).toContain('"doorOperation":"sliding"')
  })
})

describe('catalog fields reach published data', () => {
  it('artifacts carry assetPreset, material and glass for doors', () => {
    const doc = fixtureFull() as unknown as CampusDocument
    for (const b of doc.buildings) for (const f of b.floors as any[]) for (const d of [...(f.doors ?? []), ...(f.rooms ?? []).flatMap((r: any) => r.roomDoors ?? [])]) Object.assign(d, { assetPreset: 'door.glass.single', material: 'aluminium', glass: 'frosted' })
    const text = JSON.stringify(compile(doc).artifacts)
    for (const s of ['"assetPreset":"door.glass.single"', '"material":"aluminium"', '"glass":"frosted"']) expect(text).toContain(s)
  })
})
