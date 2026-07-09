// ── Layer IDs ──

export const LAYER_IDS = {
  BUILDING_FILL: 'navi-building-fill',
  BUILDING_OUTLINE: 'navi-building-outline',
  ROOM_FILL: 'navi-room-fill',
  ROOM_OUTLINE: 'navi-room-outline',
  HALLWAY_LINE: 'navi-hallway-line',
  ROAD_LINE: 'navi-road-line',
  ENTRANCE_ICON: 'navi-entrance-icon',
  STAIRCASE_ICON: 'navi-staircase-icon',
  ELEVATOR_ICON: 'navi-elevator-icon',
  PANORAMA_ICON: 'navi-panorama-icon',
  QR_ICON: 'navi-qr-icon',
  SELECTION_OVERLAY: 'navi-selection-overlay',
  HOVER_HIGHLIGHT: 'navi-hover-highlight',
  PREVIEW: 'navi-preview-layer',
  VALIDATION_OVERLAY: 'navi-validation-overlay',
} as const

export type LayerId = typeof LAYER_IDS[keyof typeof LAYER_IDS]

// ── Source IDs ──

export const SOURCE_IDS = {
  BUILDINGS: 'navi-buildings',
  ROOMS: 'navi-rooms',
  HALLWAYS: 'navi-hallways',
  ROADS: 'navi-roads',
  ENTRANCES: 'navi-entrances',
  STAIRCASES: 'navi-staircases',
  ELEVATORS: 'navi-elevators',
  PANORAMAS: 'navi-panoramas',
  QR: 'navi-qr',
  PREVIEW: 'navi-preview',
  SELECTION: 'navi-selection',
} as const

// ── Category color maps ──

export const BUILDING_CATEGORY_COLORS: Record<string, string> = {
  academic: '#4A90D9',
  residential: '#7B68EE',
  administrative: '#2E8B57',
  facility: '#CD853F',
  library: '#8B4513',
  dining: '#DC143C',
  sports: '#228B22',
  parking: '#696969',
  health: '#FF6347',
  other: '#A9A9A9',
}

export const ROOM_CATEGORY_COLORS: Record<string, string> = {
  classroom: '#87CEEB',
  office: '#98FB98',
  lab: '#FFD700',
  restroom: '#DDA0DD',
  stairwell: '#D3D3D3',
  elevator_lobby: '#E0E0E0',
  lobby: '#F0E68C',
  storage: '#C0C0C0',
  meeting: '#ADD8E6',
  auditorium: '#FFA07A',
  server: '#FF4500',
  utility: '#808080',
  other: '#E8E8E8',
}

// ── Paint style helpers ──

const CATEGORY_EXPRESSION = ['match', ['get', 'category']]

export function buildingFillPaint(): maplibregl.FillLayerSpecification['paint'] {
  return {
    'fill-color': ['case',
      ['has', 'color'], ['get', 'color'],
      ['match', ['get', 'category'],
        'academic', '#4A90D9',
        'residential', '#7B68EE',
        'administrative', '#2E8B57',
        '#A9A9A9',
      ],
    ],
    'fill-opacity': 0.25,
  }
}

export function buildingOutlinePaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': ['case',
      ['has', 'color'], ['get', 'color'],
      '#4A90D9',
    ],
    'line-width': 2,
  }
}

export function roomFillPaint(): maplibregl.FillLayerSpecification['paint'] {
  return {
    'fill-color': [
      'match', ['get', 'category'],
      'classroom', '#87CEEB',
      'office', '#98FB98',
      'lab', '#FFD700',
      'restroom', '#DDA0DD',
      'stairwell', '#D3D3D3',
      'elevator_lobby', '#E0E0E0',
      'lobby', '#F0E68C',
      'storage', '#C0C0C0',
      'meeting', '#ADD8E6',
      'auditorium', '#FFA07A',
      'server', '#FF4500',
      'utility', '#808080',
      '#E8E8E8',
    ],
    'fill-opacity': 0.4,
  }
}

export function roomOutlinePaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#666',
    'line-width': 1,
    'line-opacity': 0.6,
  }
}

export function hallwayLinePaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#B0C4DE',
    'line-width': ['get', 'width'],
    'line-opacity': 0.7,
  }
}

export function roadLinePaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#FFD700',
    'line-width': ['get', 'width'],
    'line-opacity': 0.6,
  }
}

export function iconPaint(): maplibregl.CircleLayerSpecification['paint'] {
  return {
    'circle-radius': 6,
    'circle-color': ['get', 'color'],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
  }
}

export const ENTITY_ICON_COLORS: Record<string, string> = {
  entrance: '#FF8C00',
  staircase: '#20B2AA',
  elevator: '#9370DB',
  panorama: '#FF69B4',
  qr: '#32CD32',
}

export function entityCirclePaint(entityType: string): maplibregl.CircleLayerSpecification['paint'] {
  return {
    'circle-radius': 6,
    'circle-color': ENTITY_ICON_COLORS[entityType] || '#888',
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
  }
}

export function selectionPaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#3B82F6',
    'line-width': 3,
    'line-opacity': 0.9,
  }
}

export function hoverPaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#60A5FA',
    'line-width': 2,
    'line-opacity': 0.5,
  }
}

export function previewPaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#3B82F6',
    'line-width': 2,
    'line-dasharray': [4, 4],
    'line-opacity': 0.7,
  }
}

export function validationPaint(): maplibregl.LineLayerSpecification['paint'] {
  return {
    'line-color': '#EF4444',
    'line-width': 2,
    'line-dasharray': [2, 2],
    'line-opacity': 0.8,
  }
}
