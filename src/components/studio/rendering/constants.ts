export const SRC = {
  BUILDINGS: 's-buildings',
  BOUNDARY: 's-boundary',
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
  BOUNDARY_FILL: 'l-boundary-fill',
  BOUNDARY_OUTLINE: 'l-boundary-outline',
  EDGES: 'l-edges',
  NODES: 'l-nodes',
  NODES_CONNECTION: 'l-nodes-connection',
  TRACES_LINE: 'l-traces-line',
  TRACES_OUTLINE: 'l-traces-outline',
  TRACES_INNER: 'l-traces-inner',
  DRAWING_LINE: 'l-drawing-line',
  DRAWING_POINTS: 'l-drawing-points',
} as const

export const HIDDEN_NODE_TYPES = new Set(['room', 'staircase', 'elevator'])

// OS-native cursors
export const CURSOR_CROSSHAIR = 'crosshair'

// Custom SVG pointer cursor with black outline for visibility against any background
const HAND_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30">
  <path d="M11 1a2 2 0 0 0-2 2v12.5a1.5 1.5 0 0 1-2.6-1l-.9-2.2a2.5 2.5 0 1 0-4.7 1.7l2.4 6.5A8 8 0 0 0 10.6 28h4.4a7 7 0 0 0 4.9-2l3.8-3.9a2 2 0 0 0 .5-1.3V13a2 2 0 0 0-2-2h-1.2a2 2 0 0 0-1.9 1.5l-.8 2.5V3a2 2 0 0 0-2-2z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`
const CURSOR_HAND_DATA_URI = `data:image/svg+xml;base64,${btoa(HAND_CURSOR_SVG)}`
export const CURSOR_HAND = `url("${CURSOR_HAND_DATA_URI}") 11 1, pointer`

export type SrcKey = keyof typeof SRC
export type LyrKey = keyof typeof LYR
