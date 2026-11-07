import { describe, expect, it } from 'vitest'
import { suggestStairConnection, toLatLng, type CampusDocument, type TerrainGrid } from '@navi/core'
import { stairConnectCommands, stairDisconnectCommands, STAIR_ROUTE_ID_PREFIX } from '../stair-route'
import { stairCampus, stairEditor } from './stair-fixture'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const toWorld = (_b: string, _l: number, p: { x: number; y: number }) => ll(p.x, p.y)

const connect = (document: CampusDocument) => {
  const suggestion = suggestStairConnection(document, 's1', { toWorld })!
  const commands = stairConnectCommands(document, suggestion)
  if (!Array.isArray(commands)) throw new Error(commands.error)
  return commands
}

describe('Connect to route', () => {
  it('connect writes a stairs path joined to the road and linked to the entrance', () => {
    const document = stairCampus()
    const { dispatcher } = stairEditor(document)
    expect(dispatcher.executeBatch(connect(document)).success).toBe(true)
    const path = document.roads.find((r) => r.id === `${STAIR_ROUTE_ID_PREFIX}s1`)!
    expect(path.routing).toEqual({ feature: 'stairs', structureId: 's1' })
    expect(path.heightMode).toBe('follow-surface')
    expect(path.width).toBe(2)
    expect(document.roadJunctions?.some((j) => j.roadIds.includes(path.id) && j.roadIds.includes('r1'))).toBe(true)
    const access = document.buildings[0].floors[1].entranceAccess!
    expect(access).toHaveLength(1)
    expect(access[0]).toMatchObject({ entranceId: 'e2', indoorRouteNodeId: 'n2', outdoorRouteId: path.id })
    expect(access[0].outdoorPosition).toEqual(path.polyline.points[path.polyline.points.length - 1])
  })

  it('connect then undo restores the document exactly (one history entry)', () => {
    const document = stairCampus()
    const before = structuredClone(document)
    const { dispatcher, history } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    const after = structuredClone(document)
    expect(history.undo()).toBe(true)
    expect(document.roads).toEqual(before.roads)
    expect(document.roadJunctions).toEqual(before.roadJunctions)
    expect(document.buildings).toEqual(before.buildings)
    expect(history.redo()).toBe(true)
    expect(document.roads).toEqual(after.roads)
    expect(document.buildings).toEqual(after.buildings)
  })

  it('disconnect removes what connect wrote and restores the previous entrance link', () => {
    const document = stairCampus({ linkedTo: 'r2' })
    const before = structuredClone(document.buildings[0].floors[1].entranceAccess)
    const { dispatcher } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    expect(document.buildings[0].floors[1].entranceAccess![0].outdoorRouteId).toBe(`${STAIR_ROUTE_ID_PREFIX}s1`)
    expect(dispatcher.executeBatch(stairDisconnectCommands(document, 's1')).success).toBe(true)
    expect(document.roads.some((r) => r.routing?.structureId === 's1')).toBe(false)
    expect(document.roadJunctions?.some((j) => j.roadIds.includes(`${STAIR_ROUTE_ID_PREFIX}s1`))).toBe(false)
    expect(document.buildings[0].floors[1].entranceAccess).toEqual(before)
  })

  it('a ramp gets routing.feature ramp', () => {
    const document = stairCampus({ form: 'ramp' })
    const { dispatcher } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    expect(document.roads.find((r) => r.routing?.structureId === 's1')?.routing?.feature).toBe('ramp')
  })

  it('connect refuses without a bottom route', () => {
    const document = stairCampus({ bottomOnGround: true })
    const suggestion = suggestStairConnection(document, 's1', { toWorld })!
    expect(stairConnectCommands(document, suggestion)).toEqual({ error: 'Pick the route at the bottom of the stair.' })
  })
})

describe('the stair route follows its stair', () => {
  const moved = (document: CampusDocument) => ({ ...structuredClone(document.structures![0]), end: { kind: 'road', roadId: 'r1', position: ll(40.8, 8) } })
  const route = (document: CampusDocument) => document.roads.find((r) => r.routing?.structureId === 's1')!

  it('moving the stair moves its path in the same undo step', () => {
    const document = stairCampus()
    const { dispatcher, history } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    expect(dispatcher.execute({ id: 'structure.replace', label: 'Move stair', payload: { structure: moved(document) } }).success).toBe(true)
    const points = route(document).polyline.points
    // Bottom end now joins r1 at y = 8 (the junction moved along the road with it); the top stays at the 2F edge.
    const bottom = document.roadJunctions!.find((j) => j.roadIds.includes(route(document).id))!
    expect(bottom.position.lat).toBeCloseTo(ll(40, 8).lat, 7)
    expect(points[0]).toEqual(bottom.position)
    expect(points[points.length - 1].lat).toBeCloseTo(ll(20, 5).lat, 7)
    expect(document.buildings[0].floors[1].entranceAccess![0].outdoorPosition).toEqual(points[points.length - 1])
    expect(history.undo()).toBe(true) // one step undoes the move and the path together
    expect(route(document).polyline.points[0].lat).toBeCloseTo(ll(40, 5).lat, 6)
  })

  it('swapping to a ramp preset makes the path a ramp at the new width', () => {
    const document = stairCampus()
    const { dispatcher } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    dispatcher.execute({ id: 'structure.swap-preset', label: 'Swap', payload: { id: 's1', preset: { id: 'rp', form: 'ramp', shape: { width: 3, underneath: 'solid', railings: 'none' } } } })
    expect(route(document).routing?.feature).toBe('ramp')
    expect(route(document).width).toBe(3)
  })
})
