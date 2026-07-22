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

// Double-stroke crosshair: white outline (visible on dark backgrounds) + black inner (visible on light backgrounds)
export const CURSOR_CROSSHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cline x1='12' y1='1' x2='12' y2='10' stroke='white' stroke-width='3.5'/%3E%3Cline x1='12' y1='14' x2='12' y2='23' stroke='white' stroke-width='3.5'/%3E%3Cline x1='1' y1='12' x2='10' y2='12' stroke='white' stroke-width='3.5'/%3E%3Cline x1='14' y1='12' x2='23' y2='12' stroke='white' stroke-width='3.5'/%3E%3Cline x1='12' y1='2' x2='12' y2='10' stroke='black' stroke-width='1.5'/%3E%3Cline x1='12' y1='14' x2='12' y2='22' stroke='black' stroke-width='1.5'/%3E%3Cline x1='2' y1='12' x2='10' y2='12' stroke='black' stroke-width='1.5'/%3E%3Cline x1='14' y1='12' x2='22' y2='12' stroke='black' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='2' fill='white' stroke='black' stroke-width='1'/%3E%3C/svg%3E") 12 12, crosshair`

// Thick-stroke hand: white fill with bold black outline for visibility on any background
export const CURSOR_HAND = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cpath d='M12 2c-.6 0-1 .4-1 1v9l-2.3-2.2c-.5-.5-1.2-.5-1.6 0-.5.4-.5 1.1 0 1.6l4.7 4.5-1.4 4c-.3.8-.1 1.7.5 2.3l1.8 1.8c.5.5 1.3.8 2.1.8H18c1.7 0 3-1.3 3-3v-6c0-.4-.1-.8-.3-1.1l-3-5.3c-.3-.5-.8-.8-1.4-.8-.4 0-.8.1-1.1.4l-2.2 1.7V3c0-.6-.4-1-1-1z' fill='white' stroke='black' stroke-width='2.5' stroke-linejoin='round'/%3E%3C/svg%3E") 10 4, pointer`

export type SrcKey = keyof typeof SRC
export type LyrKey = keyof typeof LYR
