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

// Custom SVG grab cursor with black outline — visible against any background
const GRAB_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="30" viewBox="0 0 28 30">
  <rect x="22" y="7" width="4" height="8" rx="2" fill="white" stroke="black" stroke-width="1.5"/>
  <rect x="17" y="3" width="4" height="11" rx="2" fill="white" stroke="black" stroke-width="1.5"/>
  <rect x="12" y="0" width="4" height="13" rx="2" fill="white" stroke="black" stroke-width="1.5"/>
  <rect x="7" y="1" width="4" height="13" rx="2" fill="white" stroke="black" stroke-width="1.5"/>
  <path d="M5 12h18v10a6 6 0 0 1-6 6h-6a5 5 0 0 1-4-2l-2-4V12z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
  <rect x="1" y="9" width="5" height="5" rx="2" fill="white" stroke="black" stroke-width="1.5"/>
</svg>`
const GRAB_CURSOR_DATA_URI = `data:image/svg+xml;base64,${btoa(GRAB_CURSOR_SVG)}`

export const CURSOR_CROSSHAIR = 'crosshair'
export const CURSOR_HAND = 'pointer'
export const CURSOR_GRAB = `url("${GRAB_CURSOR_DATA_URI}") 14 17, grab`

export type SrcKey = keyof typeof SRC
export type LyrKey = keyof typeof LYR
