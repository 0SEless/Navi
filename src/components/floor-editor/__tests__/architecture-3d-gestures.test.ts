import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '@navi/core'
import { windowFromDrag, moveWindow, resizeWindow, openingFits, captureStillCurrent, isHandleVisible } from '../architecture-3d-gestures'

const wall: Wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, height: 3.5, thickness: .2 }
const opening: Opening = { id: 'o', type: 'window', wallId: 'w', offset: 2, width: 2, sillHeight: 1, height: 1 }
describe('facade gesture geometry', () => {
  it('hides handles behind a nearer solid or region instead of editing an occluded wall', () => {
    const ray = { origin: {x:0,y:-10,z:1}, direction: {x:0,y:1,z:0} }
    const point = {x:0,y:3,z:1}
    expect(isHandleVisible(point,ray,{distance:9.9})).toBe(false)
    expect(isHandleVisible(point,ray,{distance:13})).toBe(true)
    expect(isHandleVisible(point,ray,null)).toBe(true)
    expect(isHandleVisible(point,null,null)).toBe(false)
  })
  it('draws either direction on the frozen wall with a fixed glass preset', () => {
    expect(windowFromDrag('n', wall, { offset: 4, z: 2 }, { offset: 2, z: 1 })).toEqual({ ...opening, id: 'n', windowAppearance: 'fixed' })
  })
  it('resizes with the opposite corner anchored and moves without changing dimensions', () => {
    expect(resizeWindow(opening, 0, { offset: 1, z: .5 })).toMatchObject({ offset: 1, sillHeight: .5, width: 3, height: 1.5 })
    expect(moveWindow(opening, { offset: 3, z: 1.5 }, { offset: 4, z: 2 })).toMatchObject({ offset: 3, sillHeight: 1.5, width: 2, height: 1 })
  })
  it('refuses off-wall, nonfinite and overlapping windows without mutation', () => {
    expect(openingFits({ ...opening, sillHeight: 3 }, wall, [])).toBeTruthy()
    expect(openingFits({ ...opening, offset: NaN }, wall, [])).toBeTruthy()
    expect(openingFits(opening, wall, [{ ...opening, id: 'other' }])).toBeTruthy()
    expect(openingFits(opening, wall, [opening])).toBeNull()
  })
  it('detects changed or deleted capture instead of committing stale geometry', () => {
    expect(captureStillCurrent(wall, opening, wall, opening)).toBe(true)
    expect(captureStillCurrent(wall, opening, { ...wall, height: 2 }, opening)).toBe(false)
    expect(captureStillCurrent(wall, opening, wall, undefined)).toBe(false)
  })
})
