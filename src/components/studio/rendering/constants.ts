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

// OS-native cursors — always crisp, always visible, familiar to users
export const CURSOR_CROSSHAIR = 'crosshair'
export const CURSOR_HAND = 'pointer'

export type SrcKey = keyof typeof SRC
export type LyrKey = keyof typeof LYR
