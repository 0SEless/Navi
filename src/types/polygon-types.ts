export interface Vertex {
  id: string
  x: number
  y: number
}

export interface PolygonEdge {
  id: string
  startVertexId: string
  endVertexId: string
}

export interface PolygonRing {
  id: string
  vertices: Vertex[]
  closed: boolean
}

export interface EditablePolygon {
  id: string
  rings: PolygonRing[]
  readOnly?: boolean
}
