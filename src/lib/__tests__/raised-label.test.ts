import { describe, expect, it } from 'vitest'
import { groundPointUnder } from '../raised-label'

describe('groundPointUnder', () => {
  it('finds the ground point that lines up with a raised point as the camera sees it', () => {
    // Camera 10 up at x=0; a point 2 up at x=4: the line of sight reaches the ground (0) at x=5.
    expect(groundPointUnder({ x: 0, y: 0, z: 10 }, { x: 4, y: 0, z: 2 }, 0)).toEqual({ x: 5, y: 0 })
  })

  it('leaves a point on the ground where it is', () => {
    expect(groundPointUnder({ x: 0, y: 0, z: 10 }, { x: 4, y: 3, z: 1 }, 1)).toEqual({ x: 4, y: 3 })
  })

  it('gives up when the camera is not above the point', () => {
    expect(groundPointUnder({ x: 0, y: 0, z: 1 }, { x: 4, y: 0, z: 2 }, 0)).toBeNull()
  })
})
