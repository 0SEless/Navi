import { describe, expect, it } from 'vitest'
import { createMeshLayer } from '../mesh-layer'

type Call = { name: string; args: unknown[] }

/** A WebGL stand-in that records every call; every method returns a truthy handle. */
function fakeGl() {
  const calls: Call[] = []
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      if (/^[A-Z_0-9]+$/.test(prop)) return prop
      return (...args: unknown[]) => {
        calls.push({ name: prop, args })
        return prop === 'getAttribLocation' ? 0 : {}
      }
    },
  })
  return { gl: gl as unknown as WebGLRenderingContext, calls }
}

const map = { triggerRepaint() {} } as never
const identity = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
const options = { defaultProjectionData: { mainMatrix: identity } } as never

describe('createMeshLayer', () => {
  it('setMesh before onAdd uploads on add', () => {
    const layer = createMeshLayer('stairs', { lat: 11.7, lng: 122.4 })
    layer.setMesh(new Float32Array(18 * 9))
    const { gl, calls } = fakeGl()
    layer.onAdd!(map, gl)
    expect(calls.filter((c) => c.name === 'bufferData')).toHaveLength(1)
  })

  it('vertex count = length/9', () => {
    const layer = createMeshLayer('stairs', { lat: 11.7, lng: 122.4 })
    const { gl, calls } = fakeGl()
    layer.onAdd!(map, gl)
    layer.setMesh(new Float32Array(36 * 9))
    layer.render(gl, options)
    const draw = calls.find((c) => c.name === 'drawArrays')
    expect(draw?.args[2]).toBe(36)
    expect(layer.vertexCount()).toBe(36)
  })

  it('nothing is drawn for an empty mesh', () => {
    const layer = createMeshLayer('stairs', { lat: 11.7, lng: 122.4 })
    const { gl, calls } = fakeGl()
    layer.onAdd!(map, gl)
    layer.render(gl, options)
    expect(calls.some((c) => c.name === 'drawArrays')).toBe(false)
  })

  it('a vertical scale of 0 flattens the mesh onto the map (top view)', () => {
    const layer = createMeshLayer('stairs', { lat: 11.7, lng: 122.4 })
    const { gl, calls } = fakeGl()
    layer.onAdd!(map, gl)
    layer.setMesh(new Float32Array(3 * 9))
    layer.setVerticalScale(0)
    layer.render(gl, options)
    const matrix = calls.find((c) => c.name === 'uniformMatrix4fv')!.args[2] as Float32Array
    expect([matrix[8], matrix[9], matrix[10]]).toEqual([0, 0, 0])
  })

  it('project uses the last drawn camera and the height', () => {
    const layer = createMeshLayer('stairs', { lat: 0, lng: 0 })
    expect(layer.project({ lat: 0, lng: 0 }, 0, { width: 100, height: 100 })).toBeNull()
    const { gl } = fakeGl()
    layer.onAdd!(map, gl)
    layer.render(gl, options)
    // Identity camera: Mercator (0.5, 0.5) maps to clip (0.5, 0.5) → screen (75, 25).
    const ground = layer.project({ lat: 0, lng: 0 }, 0, { width: 100, height: 100 })!
    expect(ground.x).toBeCloseTo(75, 6)
    expect(ground.y).toBeCloseTo(25, 6)
  })
})
