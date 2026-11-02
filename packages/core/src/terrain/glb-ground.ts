// Reads the ground mesh (meshes named TPX_Ground*) from a TopoExport .glb.
// Positions are local metres: x east, y north, z height (verified on the ASU-Ibajay export).

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const COMPONENT_BYTES: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }

interface Accessor { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }
interface BufferView { byteOffset?: number; byteLength: number; byteStride?: number }
interface GltfJson {
  meshes?: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number }> }>
  accessors?: Accessor[]
  bufferViews?: BufferView[]
}

function readAccessor(json: GltfJson, bin: DataView, index: number, components: number): number[] {
  const accessor = json.accessors?.[index]
  if (!accessor || accessor.bufferView === undefined) throw new Error(`glTF accessor ${index} is missing.`)
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) throw new Error(`glTF buffer view ${accessor.bufferView} is missing.`)
  const size = COMPONENT_BYTES[accessor.componentType]
  if (!size) throw new Error(`glTF component type ${accessor.componentType} is not supported.`)
  const stride = view.byteStride ?? size * components
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const out: number[] = []
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * size
      switch (accessor.componentType) {
        case 5126: out.push(bin.getFloat32(at, true)); break
        case 5125: out.push(bin.getUint32(at, true)); break
        case 5123: out.push(bin.getUint16(at, true)); break
        default: out.push(bin.getUint8(at))
      }
    }
  }
  return out
}

export function readGlbGroundMesh(bytes: Uint8Array): { positions: Float32Array; indices: Uint32Array } {
  if (bytes.length < 20) throw new Error('This is not a .glb file.')
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (data.getUint32(0, true) !== GLB_MAGIC) throw new Error('This is not a .glb file.')
  let json: GltfJson | null = null
  let bin: DataView | null = null
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = data.getUint32(offset, true)
    const type = data.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length))) as GltfJson
    if (type === CHUNK_BIN) bin = new DataView(bytes.buffer, bytes.byteOffset + start, length)
    offset = start + length
  }
  const grounds = (json?.meshes ?? []).filter((mesh) => /^TPX_Ground/.test(mesh.name ?? ''))
  if (!json || grounds.length === 0) throw new Error('No TPX_Ground mesh in this file')
  if (!bin) throw new Error('The .glb file has no binary data.')

  const positions: number[] = []
  const indices: number[] = []
  for (const mesh of grounds) {
    for (const primitive of mesh.primitives) {
      const first = positions.length / 3
      const position = primitive.attributes.POSITION
      if (position === undefined) continue
      const points = readAccessor(json, bin, position, 3)
      positions.push(...points)
      const count = points.length / 3
      const own = primitive.indices === undefined ? [...Array(count).keys()] : readAccessor(json, bin, primitive.indices, 1)
      for (const index of own) indices.push(first + index)
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}
