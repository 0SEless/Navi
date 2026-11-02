import { describe, expect, it } from 'vitest'
import type { CampusDocument, Structure, StructurePreset } from '@navi/core'
import { BUILT_IN_PRESETS } from '@navi/core'
import { structureHandlers } from '../structure-handlers'
import type { Command } from '../types'

const stair: Structure = {
  id: 's1', form: 'stairs', presetId: 'plain-stair', width: 1.5, underneath: 'open', railings: 'both',
  start: { kind: 'ground', position: { lat: 11.8, lng: 122.1 } },
  end: { kind: 'road', roadId: 'r1', position: { lat: 11.8001, lng: 122.1001 } },
  bend: { lat: 11.80005, lng: 122.10008 },
}

function doc(): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] } as unknown as CampusDocument
}

function run(d: CampusDocument, command: Command): Command | null {
  const handler = structureHandlers.find((h) => h.id === command.id)!
  const result = handler.execute(d, command.payload)
  if (!result.success) throw new Error(result.error)
  return handler.inverse?.(command.payload, result) ?? null
}

describe('structure commands', () => {
  it('create rejects width outside 0.6–10', () => {
    const create = structureHandlers.find((h) => h.id === 'structure.create')!
    expect(create.execute(doc(), { structure: { ...stair, width: 0.5 } }).success).toBe(false)
    expect(create.execute(doc(), { structure: { ...stair, width: 10.5 } }).success).toBe(false)
    expect(create.execute(doc(), { structure: stair }).success).toBe(true)
  })

  it('create then undo leaves no structures field', () => {
    const d = doc()
    const undo = run(d, { id: 'structure.create', label: 'Add stair', payload: { structure: stair } })!
    expect(d.structures).toEqual([stair])
    run(d, undo)
    expect('structures' in d).toBe(false)
  })

  it('swap preset keeps start, end and bend', () => {
    const d = doc()
    run(d, { id: 'structure.create', label: 'Add stair', payload: { structure: stair } })
    const undo = run(d, { id: 'structure.swap-preset', label: 'Swap preset', payload: { id: 's1', preset: BUILT_IN_PRESETS[1] } })!
    expect(d.structures![0]).toMatchObject({ presetId: 'hillside-stair', width: 4.5, underneath: 'solid', railings: 'both', start: stair.start, end: stair.end, bend: stair.bend })
    run(d, undo)
    expect(d.structures![0]).toEqual(stair)
  })

  it('replace and its undo restore a removed optional field', () => {
    const d = doc()
    run(d, { id: 'structure.create', label: 'Add stair', payload: { structure: stair } })
    const { bend: _bend, ...straight } = stair
    const undo = run(d, { id: 'structure.replace', label: 'Straighten', payload: { structure: straight } })!
    expect('bend' in d.structures![0]).toBe(false)
    run(d, undo)
    expect(d.structures![0].bend).toEqual(stair.bend)
  })

  it('delete inverse restores at the same place', () => {
    const d = doc()
    run(d, { id: 'structure.create', label: 'Add stair', payload: { structure: stair } })
    run(d, { id: 'structure.create', label: 'Add stair', payload: { structure: { ...stair, id: 's2' } } })
    const undo = run(d, { id: 'structure.delete', label: 'Delete stair', payload: { id: 's1' } })!
    expect(d.structures!.map((s) => s.id)).toEqual(['s2'])
    run(d, undo)
    expect(d.structures!.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('presets: create, then delete with undo', () => {
    const d = doc()
    const preset: StructurePreset = { ...BUILT_IN_PRESETS[0], id: 'my-stair', name: 'My stair' }
    run(d, { id: 'structure-preset.create', label: 'Save as preset', payload: { preset } })
    expect(d.structurePresets).toEqual([preset])
    const undo = run(d, { id: 'structure-preset.delete', label: 'Delete preset', payload: { id: 'my-stair' } })!
    expect('structurePresets' in d).toBe(false)
    run(d, undo)
    expect(d.structurePresets).toEqual([preset])
  })
})
