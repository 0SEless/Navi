import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'

type LatLng = { lat: number; lng: number }

// MapLibre's Web Mercator (same earth radius), so the mesh lines up with the map without importing it here.
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8

function mercator(p: LatLng): { x: number; y: number } {
  return {
    x: (180 + p.lng) / 360,
    y: (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI) / 360))) / 360,
  }
}

function metresInMercator(lat: number): number {
  return 1 / (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180))
}

/** Column-major 4×4 product a × b, in Float64. */
function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

const VERTEX = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec3 a_col;
uniform mat4 u_matrix;
varying vec3 v_col;
void main() {
  vec3 light = normalize(vec3(-0.4, -0.6, 0.8));
  float shade = 0.55 + 0.45 * abs(dot(normalize(a_nrm), light));
  v_col = a_col * shade;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`

const FRAGMENT = `
precision mediump float;
varying vec3 v_col;
void main() { gl_FragColor = vec4(v_col, 1.0); }`

export interface MeshLayer extends CustomLayerInterface {
  /** Interleaved position (local metres east/north, absolute metres up), normal, colour: 9 floats per vertex. */
  setMesh(mesh: Float32Array): void
  /** 1 = true height, the terrain's exaggeration when it is exaggerated, 0 = flat on the map (top view). */
  setVerticalScale(scale: number): void
  /** Screen position of a 3D point with the last drawn camera; null before the first frame. */
  project(p: LatLng, heightM: number, size: { width: number; height: number }): { x: number; y: number } | null
  vertexCount(): number
}

/** The structures mesh layer of each map (for handles drawn at their real height). */
export const meshLayerByMap = new WeakMap<object, MeshLayer>()

/** Screen position of a point at a height: where the mesh layer draws it, else on the map plane. */
export function projectAtHeight(map: MapLibreMap, p: LatLng, heightM: number): { x: number; y: number } {
  const canvas = map.getCanvas()
  const projected = meshLayerByMap.get(map)?.project(p, heightM, { width: canvas.clientWidth, height: canvas.clientHeight })
  if (projected) return projected
  const flat = map.project([p.lng, p.lat])
  return { x: flat.x, y: flat.y }
}

/**
 * A MapLibre custom layer that draws one triangle mesh in local metres around `origin`
 * (the terrain grid origin). Model matrix = mainMatrix × translate(origin) × scale(s, −s, s·vertical),
 * with s = Mercator units per metre at the origin; built in Float64 and uploaded as Float32.
 */
export function createMeshLayer(id: string, origin: LatLng): MeshLayer {
  const o = mercator(origin)
  const s = metresInMercator(origin.lat)
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let map: MapLibreMap | null = null
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let locations = { pos: 0, nrm: 0, col: 0, matrix: null as WebGLUniformLocation | null }
  let mesh: Float32Array = new Float32Array(0)
  let uploaded = false
  let vertical = 1
  let lastMain: Float64Array | null = null

  const upload = () => {
    if (!gl || !buffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW)
    uploaded = true
  }

  const model = () => new Float64Array([s, 0, 0, 0, 0, -s, 0, 0, 0, 0, s * vertical, 0, o.x, o.y, 0, 1])

  return {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, context) {
      map = m
      gl = context
      const compile = (type: number, source: string) => {
        const shader = context.createShader(type)!
        context.shaderSource(shader, source)
        context.compileShader(shader)
        return shader
      }
      program = context.createProgram()!
      context.attachShader(program, compile(context.VERTEX_SHADER, VERTEX))
      context.attachShader(program, compile(context.FRAGMENT_SHADER, FRAGMENT))
      context.linkProgram(program)
      locations = {
        pos: context.getAttribLocation(program, 'a_pos'),
        nrm: context.getAttribLocation(program, 'a_nrm'),
        col: context.getAttribLocation(program, 'a_col'),
        matrix: context.getUniformLocation(program, 'u_matrix'),
      }
      buffer = context.createBuffer()
      if (mesh.length > 0) upload()
    },
    onRemove(_m, context) {
      if (buffer) context.deleteBuffer(buffer)
      if (program) context.deleteProgram(program)
      gl = null
      map = null
      buffer = null
      program = null
      uploaded = false
    },
    setMesh(next) {
      mesh = next
      uploaded = false
      if (gl) upload()
      map?.triggerRepaint()
    },
    setVerticalScale(scale) {
      if (scale === vertical) return
      vertical = scale
      map?.triggerRepaint()
    },
    render(context, options: CustomRenderMethodInput) {
      lastMain = new Float64Array(options.defaultProjectionData.mainMatrix)
      const count = Math.floor(mesh.length / 9)
      if (!program || !buffer || count === 0) return
      if (!uploaded) upload()
      context.useProgram(program)
      context.uniformMatrix4fv(locations.matrix, false, new Float32Array(multiply(lastMain, model())))
      context.bindBuffer(context.ARRAY_BUFFER, buffer)
      const stride = 9 * 4
      context.enableVertexAttribArray(locations.pos)
      context.vertexAttribPointer(locations.pos, 3, context.FLOAT, false, stride, 0)
      context.enableVertexAttribArray(locations.nrm)
      context.vertexAttribPointer(locations.nrm, 3, context.FLOAT, false, stride, 12)
      context.enableVertexAttribArray(locations.col)
      context.vertexAttribPointer(locations.col, 3, context.FLOAT, false, stride, 24)
      context.enable(context.DEPTH_TEST)
      context.depthFunc(context.LEQUAL)
      context.drawArrays(context.TRIANGLES, 0, count)
    },
    vertexCount() {
      return Math.floor(mesh.length / 9)
    },
    project(p, heightM, size) {
      if (!lastMain) return null
      const m = mercator(p)
      const v = [m.x, m.y, heightM * s * vertical, 1]
      const clip = [0, 1, 2, 3].map((row) => lastMain![row] * v[0] + lastMain![4 + row] * v[1] + lastMain![8 + row] * v[2] + lastMain![12 + row] * v[3])
      if (!(clip[3] > 0)) return null
      return { x: ((clip[0] / clip[3] + 1) / 2) * size.width, y: ((1 - clip[1] / clip[3]) / 2) * size.height }
    },
  }
}
