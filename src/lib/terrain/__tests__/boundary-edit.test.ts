import { describe, expect, it } from 'vitest'
import { edgeMidpoints, insertCorner, removeCorner } from '../boundary-edit'

const a = { lat: 0, lng: 0 }
const b = { lat: 0, lng: 2 }
const c = { lat: 2, lng: 2 }
const d = { lat: 2, lng: 0 }
const square = [a, b, c, d]

describe('boundary-edit', () => {
  it('edgeMidpoints of a square has 4 midpoints incl. the closing edge', () => {
    expect(edgeMidpoints(square)).toEqual([{ lat: 0, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 1 }, { lat: 1, lng: 0 }])
  })

  it('insertCorner puts the new corner after edgeIndex', () => {
    const at = { lat: -1, lng: 1 }
    expect(insertCorner(square, 0, at)).toEqual([a, at, b, c, d])
  })

  it('insertCorner on the closing edge appends', () => {
    const at = { lat: 1, lng: -1 }
    expect(insertCorner(square, 3, at)).toEqual([a, b, c, d, at])
  })

  it('removeCorner keeps the rest in order', () => {
    expect(removeCorner(square, 1)).toEqual([a, c, d])
  })

  it('removeCorner refuses below 3 corners', () => {
    expect(removeCorner([a, b, c], 0)).toBeNull()
  })

  it('works on a closed ring input', () => {
    const closed = [...square, a]
    expect(edgeMidpoints(closed)).toHaveLength(4)
    expect(insertCorner(closed, 3, { lat: 1, lng: -1 })).toEqual([a, b, c, d, { lat: 1, lng: -1 }])
    expect(removeCorner(closed, 0)).toEqual([b, c, d])
  })
})
