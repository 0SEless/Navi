/**
 * Ground looks for NAVI Web's campus terrain. The campus owner picks the default in Studio's terrain
 * editor (published with the site); visitors may switch on their device. Decorative only.
 */
export type TerrainLook = 'green' | 'vivid' | 'neutral' | 'sand'
export const TERRAIN_LOOKS: readonly TerrainLook[] = ['green', 'vivid', 'neutral', 'sand']
export const DEFAULT_TERRAIN_LOOK: TerrainLook = 'green'

export interface TerrainLookStyle {
  label: string
  /** Flat ground colour (under the height colours, and the whole ground for Neutral). */
  ground: string
  /** Height colours from the lowest to the highest ground; null = no height colours. */
  heightColors: readonly string[] | null
  /** Hill shading: soft, crisp (multidirectional), tinted to the look. */
  shading: { shadow: string; highlight: string; exaggeration: number }
}

const STYLES: Record<TerrainLook, TerrainLookStyle> = {
  green: {
    label: 'Green terraces', ground: '#a0c180',
    heightColors: ['#86a866', '#93b573', '#a0c180', '#adcc8e', '#bad69c'],
    shading: { shadow: 'rgba(60,90,40,0.5)', highlight: 'rgba(255,255,255,0.18)', exaggeration: 0.4 },
  },
  vivid: {
    label: 'Vivid green', ground: '#7fbe50',
    heightColors: ['#5e9c36', '#6eae42', '#7fbe50', '#92cb63', '#a4d675'],
    shading: { shadow: 'rgba(35,75,20,0.55)', highlight: 'rgba(255,255,255,0.18)', exaggeration: 0.4 },
  },
  // The terrain editor's Neutral ground (src/components/terrain/TerrainMap.tsx GROUND_COLOR).
  neutral: {
    label: 'Neutral', ground: '#e9e3d6', heightColors: null,
    shading: { shadow: 'rgba(111,100,85,0.5)', highlight: 'rgba(255,253,247,0.35)', exaggeration: 0.4 },
  },
  // The terrain editor's Heights colours (color-scale.ts heightsColorStops).
  sand: {
    label: 'Sand heights', ground: '#ece3cf', heightColors: ['#ece3cf', '#c9ab80', '#8a6a48'],
    shading: { shadow: 'rgba(110,85,55,0.5)', highlight: 'rgba(255,250,240,0.3)', exaggeration: 0.4 },
  },
}

export function isTerrainLook(value: unknown): value is TerrainLook {
  return typeof value === 'string' && (TERRAIN_LOOKS as readonly string[]).includes(value)
}

export function terrainLookStyle(look: TerrainLook): TerrainLookStyle {
  return STYLES[look]
}

/** Height colour stops spread evenly from minM to maxM (a flat campus gets a 1 m range); null for no colours. */
export function terrainLookRelief(look: TerrainLook, minM: number, maxM: number): Array<[number, string]> | null {
  const colors = STYLES[look].heightColors
  if (!colors) return null
  const top = maxM > minM ? maxM : minM + 1
  return colors.map((color, i) => [minM + (top - minM) * i / (colors.length - 1), color])
}
