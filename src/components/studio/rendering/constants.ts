export const SRC = {
  BUILDINGS: 's-buildings',
  EDGES: 's-edges',
  NODES: 's-nodes',
  NODES_CONNECTION: 's-nodes-connection',
  TRACES: 's-traces',
  DRAWING: 's-drawing',
} as const

export const LYR = {
  BUILDINGS_FILL: 'l-buildings-fill',
  BUILDINGS_EXTRUSION: 'l-buildings-extrusion',
  BUILDINGS_OUTLINE: 'l-buildings-outline',
  EDGES: 'l-edges',
  NODES: 'l-nodes',
  NODES_CONNECTION: 'l-nodes-connection',
  TRACES_LINE: 'l-traces-line',
  TRACES_INNER: 'l-traces-inner',
  DRAWING_LINE: 'l-drawing-line',
  DRAWING_POINTS: 'l-drawing-points',
} as const

export const HIDDEN_NODE_TYPES = new Set(['room', 'staircase', 'elevator'])

export const CURSOR_CROSSHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cline x1='12' y1='2' x2='12' y2='10' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='14' x2='12' y2='22' stroke='%23000' stroke-width='2'/%3E%3Cline x1='2' y1='12' x2='10' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='14' y1='12' x2='22' y2='12' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`

export type SrcKey = keyof typeof SRC
export type LyrKey = keyof typeof LYR
