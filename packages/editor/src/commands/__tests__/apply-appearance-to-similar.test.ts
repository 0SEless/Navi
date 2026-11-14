import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { doorApplyAppearanceToSimilarHandler, findSimilarDoors } from '../feature-handlers'

const at = (id: string, offset: number, width = 0.9, extra: Record<string, unknown> = {}) => ({ id, position: { x: offset, y: 0 }, width, depth: 0.2, doorType: 'standard', metadata: {}, wallAttachment: { wallId: 'w', offset, openingHeight: 2.1 }, ...extra })
function fixture(): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: { campusId: 'c', name: 'c', description: '', lastModified: '', editorVersion: '' }, roads: [], panoramas: [], qrCheckpoints: [], buildings: [{ id: 'b', name: 'B', floors: [{ id: 'f', level: 0, height: 3.5, elevation: 0, label: 'GF', rooms: [], roomAttributes: [], hallways: [], entrances: [], staircases: [], elevators: [], connectorStops: [], metadata: {},
    walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, height: 3.5, thickness: 0.2 }],
    doors: [
      at('src', 2, 0.9, { assetPreset: 'door.steel.single', material: 'painted-steel', doorPose: 'ajar' }),
      at('a', 5, 0.95), at('b2', 8, 0.85, { material: 'wood' }), at('c', 11, 1.0),
      at('wide', 14, 1.8), at('slide', 17, 0.9, { doorType: 'sliding' }), at('arch', 20, 0.9, { doorType: 'opening' }),
    ] }] }] } as unknown as CampusDocument
}
const payload = { buildingId: 'b', floorId: 'f', sourceDoorId: 'src', fields: ['assetPreset', 'material', 'glass', 'doorPose'] }
const doors = (doc: CampusDocument) => doc.buildings[0].floors[0].doors! as unknown as Array<Record<string, unknown>>

describe('door.applyAppearanceToSimilar', () => {
  it('matches same operation and width within 0.1 m on the same floor', () => {
    expect(findSimilarDoors(fixture().buildings[0].floors[0], 'src').map(d => d.id)).toEqual(['a', 'b2', 'c'])
  })

  it('applies the source fields to all 3 and the single inverse restores all 3 exactly', () => {
    const doc = fixture(); const before = JSON.stringify(doc.buildings)
    const result = doorApplyAppearanceToSimilarHandler.execute(doc, payload)
    expect(result).toMatchObject({ success: true, data: { count: 3 } })
    for (const id of ['a', 'b2', 'c']) expect(doors(doc).find(d => d.id === id)).toMatchObject({ assetPreset: 'door.steel.single', material: 'painted-steel', doorPose: 'ajar' })
    expect(doors(doc).find(d => d.id === 'b2')).not.toHaveProperty('glass')
    expect(doors(doc).find(d => d.id === 'wide')).not.toHaveProperty('assetPreset')
    const inverse = doorApplyAppearanceToSimilarHandler.inverse!(payload, result)!
    expect(inverse.id).toBe('door.applyAppearanceToSimilar')
    expect(doorApplyAppearanceToSimilarHandler.execute(doc, inverse.payload).success).toBe(true)
    expect(JSON.stringify(doc.buildings)).toBe(before)
  })

  it('fails atomically when the floor is locked; document unchanged, no inverse', () => {
    const doc = fixture(); (doc.buildings[0].floors[0] as { locked?: boolean }).locked = true
    const before = JSON.stringify(doc)
    const result = doorApplyAppearanceToSimilarHandler.execute(doc, payload)
    expect(result.success).toBe(false)
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('fails atomically when a value to copy is invalid; document unchanged', () => {
    const doc = fixture(); doors(doc)[0].material = 'gold'
    const before = JSON.stringify(doc)
    const result = doorApplyAppearanceToSimilarHandler.execute(doc, payload)
    expect(result).toMatchObject({ success: false, error: 'Material must be wood, painted-steel, aluminium or fire-red' })
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('rejects unknown field names and a missing source', () => {
    expect(doorApplyAppearanceToSimilarHandler.execute(fixture(), { ...payload, fields: ['position'] }).success).toBe(false)
    expect(doorApplyAppearanceToSimilarHandler.execute(fixture(), { ...payload, sourceDoorId: 'nope' }).success).toBe(false)
  })
})

describe('final review fix: legacy look is copied too', () => {
  it('copies doorAppearance and removes a preset the source lacks, so targets look like the source', () => {
    const doc = fixture(); const ds = doors(doc)
    for (const k of ['assetPreset', 'material', 'doorPose']) delete ds[0][k]
    ds[0].doorAppearance = 'glass'; ds[1].assetPreset = 'door.wood.half-glass'
    const result = doorApplyAppearanceToSimilarHandler.execute(doc, { ...payload, fields: ['assetPreset', 'material', 'glass', 'doorPose', 'doorAppearance'] })
    expect(result.success).toBe(true)
    expect(doors(doc).find(d => d.id === 'a')).toMatchObject({ doorAppearance: 'glass' })
    expect(doors(doc).find(d => d.id === 'a')).not.toHaveProperty('assetPreset')
  })
})
