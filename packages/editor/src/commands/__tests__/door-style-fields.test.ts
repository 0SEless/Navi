import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { doorCreateHandler, doorUpdateHandler, openingCreateHandler, openingUpdateHandler } from '../feature-handlers'

function fixture(): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: { campusId: 'c', name: 'c', description: '', lastModified: '', editorVersion: '' }, roads: [], panoramas: [], qrCheckpoints: [], buildings: [{ id: 'b', name: 'B', floors: [{ id: 'f', level: 0, height: 3.5, elevation: 0, label: 'GF', rooms: [{ id: 'owner', name: 'Owner', roomDoors: [], polygon: { points: [] } }], roomAttributes: [], hallways: [], entrances: [], staircases: [], elevators: [], connectorStops: [], metadata: {}, walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3.5, thickness: 0.2 }], doors: [] }] }] } as unknown as CampusDocument
}
const create = { buildingId: 'b', floorId: 'f', roomId: 'owner', door: { id: 'd', position: { x: 3, y: 0 }, width: 1, depth: 0.2, wallAttachment: { wallId: 'w', offset: 3, openingHeight: 2.1 } } }
const door = (doc: CampusDocument) => doc.buildings[0].floors[0].doors![0] as unknown as Record<string, unknown>

describe('door style fields', () => {
  it('door.update accepts hingeSide/swingSide/doorOperation and stores them', () => {
    const doc = fixture(); doorCreateHandler.execute(doc, create)
    const result = doorUpdateHandler.execute(doc, { doorId: 'd', patch: { hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' } })
    expect(result.success).toBe(true)
    expect(door(doc)).toMatchObject({ hingeSide: 'end', swingSide: 'right', doorOperation: 'sliding' })
  })

  it('door.create stores the new fields', () => {
    const doc = fixture()
    expect(doorCreateHandler.execute(doc, { ...create, door: { ...create.door, hingeSide: 'end', swingSide: 'right', doorOperation: 'folding' } }).success).toBe(true)
    expect(door(doc)).toMatchObject({ hingeSide: 'end', swingSide: 'right', doorOperation: 'folding' })
  })

  it.each([
    [{ swingSide: 'up' }, 'Swing side must be left or right'],
    [{ hingeSide: 'middle' }, 'Hinge side must be start or end'],
    [{ doorOperation: 'teleport' }, 'Door operation must be hinged, sliding, folding, rolling or none'],
  ])('door.update rejects %o before mutation', (patch, error) => {
    const doc = fixture(); doorCreateHandler.execute(doc, create); const snapshot = JSON.stringify(doc)
    const result = doorUpdateHandler.execute(doc, { doorId: 'd', patch })
    expect(result).toMatchObject({ success: false, error })
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('door.update style-only edit keeps geometry and route links, and undo restores the previous absence exactly', () => {
    const doc = fixture(); doorCreateHandler.execute(doc, create); const floor = doc.buildings[0].floors[0]
    floor.doors![0].position = { x: 1, y: 2 }; delete floor.doors![0].geometry
    const before = structuredClone(floor.doors![0]), network = structuredClone(floor.routeNetwork)
    const payload = { doorId: 'd', patch: { swingSide: 'right', hingeSide: 'end' } }
    const result = doorUpdateHandler.execute(doc, payload)
    expect(result.success).toBe(true)
    expect(floor.doors![0]).toEqual({ ...before, swingSide: 'right', hingeSide: 'end' })
    expect(floor.routeNetwork).toEqual(network)
    expect(doorUpdateHandler.execute(doc, doorUpdateHandler.inverse!(payload, result)!.payload).success).toBe(true)
    expect(floor.doors![0]).toEqual(before)
    expect('swingSide' in floor.doors![0]).toBe(false)
  })

  it('opening.update accepts style fields on a door opening and rejects them on a window', () => {
    const doc = fixture()
    expect(openingCreateHandler.execute(doc, { buildingId: 'b', floorId: 'f', opening: { id: 'o', type: 'door', wallId: 'w', offset: 5, width: 1 } }).success).toBe(true)
    expect(openingUpdateHandler.execute(doc, { buildingId: 'b', floorId: 'f', openingId: 'o', patch: { swingSide: 'right', doorOperation: 'sliding' } }).success).toBe(true)
    expect(doc.buildings[0].floors[0].openings![0]).toMatchObject({ swingSide: 'right', doorOperation: 'sliding' })
    expect(openingCreateHandler.execute(doc, { buildingId: 'b', floorId: 'f', opening: { id: 'win', type: 'window', wallId: 'w', offset: 1, width: 1 } }).success).toBe(true)
    const result = openingUpdateHandler.execute(doc, { buildingId: 'b', floorId: 'f', openingId: 'win', patch: { hingeSide: 'end' } })
    expect(result.success).toBe(false)
  })
})

describe('catalog fields', () => {
  it('door.update stores assetPreset, material and glass as a cosmetic edit', () => {
    const doc = fixture(); doorCreateHandler.execute(doc, create)
    expect(doorUpdateHandler.execute(doc, { doorId: 'd', patch: { assetPreset: 'door.glass.single', material: 'aluminium', glass: 'frosted' } }).success).toBe(true)
    expect(door(doc)).toMatchObject({ assetPreset: 'door.glass.single', material: 'aluminium', glass: 'frosted' })
  })
  it.each([
    [{ assetPreset: 'door.castle' }, 'Unknown door preset'],
    [{ material: 'gold' }, 'Material must be wood, painted-steel, aluminium or fire-red'],
    [{ glass: 'mirror' }, 'Glass must be clear, frosted or tinted'],
  ])('door.update rejects %o', (patch, error) => {
    const doc = fixture(); doorCreateHandler.execute(doc, create)
    expect(doorUpdateHandler.execute(doc, { doorId: 'd', patch })).toMatchObject({ success: false, error })
  })
})

describe('window style fields (Task 13)', () => {
  const window = (extra: Record<string, unknown> = {}) => ({ buildingId: 'b', floorId: 'f', opening: { id: 'win', type: 'window', wallId: 'w', offset: 5, width: 1.2, ...extra } })
  const opening = (doc: CampusDocument) => doc.buildings[0].floors[0].openings![0] as unknown as Record<string, unknown>
  it.each(['jalousie', 'sliding', 'casement', 'awning', 'transom', 'vent-block', 'fixed', 'two-pane', 'open'])('opening.update accepts windowAppearance %s', windowAppearance => {
    const doc = fixture(); expect(openingCreateHandler.execute(doc, window()).success).toBe(true)
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowAppearance } }).success).toBe(true)
    expect(opening(doc).windowAppearance).toBe(windowAppearance)
  })
  it('opening.update rejects windowAppearance stained before mutation', () => {
    const doc = fixture(); openingCreateHandler.execute(doc, window()); const snapshot = JSON.stringify(doc)
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowAppearance: 'stained' } }).success).toBe(false)
    expect(JSON.stringify(doc)).toBe(snapshot)
  })
  it('windowPose only valid for casement/awning (and jalousie, whose slats tilt)', () => {
    const doc = fixture(); openingCreateHandler.execute(doc, window())
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowPose: 'open' } })).toMatchObject({ success: false, error: 'Window position applies to casement, awning and jalousie windows only' })
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowAppearance: 'casement', windowPose: 'open' } }).success).toBe(true)
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowPose: 'ajar' } }).success).toBe(false)
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowAppearance: 'fixed', assetPreset: 'window.awning', windowPose: 'closed' } }).success).toBe(true)
  })
  it('window presets are accepted for windows, door presets are not; opening.create stores catalog fields', () => {
    const doc = fixture()
    expect(openingCreateHandler.execute(doc, window({ assetPreset: 'window.jalousie', material: 'aluminium', glass: 'frosted' })).success).toBe(true)
    expect(opening(doc)).toMatchObject({ assetPreset: 'window.jalousie', material: 'aluminium', glass: 'frosted' })
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { assetPreset: 'door.wood.single' } })).toMatchObject({ success: false, error: 'Unknown window preset' })
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { hingeSide: 'end' } }).success).toBe(false)
  })
})

describe('jalousie position (Task 14 ruling)', () => {
  it('opening.update accepts windowPose open on a jalousie window', () => {
    const doc = fixture()
    openingCreateHandler.execute(doc, { buildingId: 'b', floorId: 'f', opening: { id: 'win', type: 'window', wallId: 'w', offset: 5, width: 1.2, assetPreset: 'window.jalousie' } })
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { windowPose: 'open' } }).success).toBe(true)
  })
})

describe('clearing a window position with a preset change', () => {
  it('opening.update accepts {assetPreset fixed, windowPose undefined} on an open casement', () => {
    const doc = fixture()
    openingCreateHandler.execute(doc, { buildingId: 'b', floorId: 'f', opening: { id: 'win', type: 'window', wallId: 'w', offset: 5, width: 1.2, assetPreset: 'window.casement', windowPose: 'open' } })
    expect(openingUpdateHandler.execute(doc, { openingId: 'win', patch: { assetPreset: 'window.fixed', windowPose: undefined } }).success).toBe(true)
    expect(JSON.parse(JSON.stringify(doc.buildings[0].floors[0].openings![0]))).not.toHaveProperty('windowPose')
  })
})
