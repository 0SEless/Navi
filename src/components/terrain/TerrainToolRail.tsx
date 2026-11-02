'use client'

export type TerrainTool =
  | 'raise-lower'
  | 'smooth'
  | 'flatten'
  | 'slope'
  | 'lasso'
  | 'picker'
  | 'pad'
  | 'reset'
  | 'contour-pen'
  | 'boundary'
  | 'stairs'
  | 'pan'

export interface ToolEntry { id: TerrainTool; label: string; hint: string }

/** The tools available so far (later tasks add theirs to this list). */
export const TERRAIN_TOOLS: ToolEntry[] = [
  { id: 'pan', label: 'Move', hint: 'Move and tilt the view' },
  { id: 'raise-lower', label: 'Raise / Lower', hint: 'B · hold Shift to do the opposite' },
  { id: 'smooth', label: 'Smooth', hint: 'Evens out bumps' },
  { id: 'flatten', label: 'Flatten', hint: 'Holds the height where the stroke starts' },
  { id: 'slope', label: 'Slope', hint: 'Two points: a straight slope between their heights' },
  { id: 'lasso', label: 'Lasso', hint: 'Set, raise or lower everything inside an area' },
  { id: 'pad', label: 'Buildings', hint: 'Base height, pad and floors of a building' },
  { id: 'stairs', label: 'Stairs', hint: 'Click to place a stair, then drag its ends onto a floor edge and a road' },
  { id: 'picker', label: 'Height picker', hint: 'Click to pick a height (or Alt+click with a brush)' },
  { id: 'reset', label: 'Reset', hint: 'Remove changes inside an area (back to the base)' },
  { id: 'contour-pen', label: 'Contour pen', hint: 'Trace height lines, then Generate surface' },
  { id: 'boundary', label: 'Edit boundary', hint: 'Drag a corner of the campus boundary' },
]

export function TerrainToolRail({ tool, tools = TERRAIN_TOOLS, disabled, alwaysOn = ['pan'], onTool }: {
  tool: TerrainTool
  tools?: ToolEntry[]
  disabled: boolean
  /** Tools that stay usable without the terrain lock (stairs are free parts). */
  alwaysOn?: TerrainTool[]
  onTool: (tool: TerrainTool) => void
}) {
  return (
    <div role="toolbar" aria-label="Terrain tools" aria-orientation="vertical" style={{
      position: 'absolute', left: 12, top: 12, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
      background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      {tools.map((entry) => (
        <button
          key={entry.id}
          type="button"
          title={entry.hint}
          aria-pressed={tool === entry.id}
          disabled={disabled && !alwaysOn.includes(entry.id)}
          onClick={() => onTool(entry.id)}
          style={{
            textAlign: 'left', padding: '5px 10px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
            background: tool === entry.id ? 'var(--navi-primary, #2563eb)' : 'transparent',
            color: tool === entry.id ? 'white' : 'var(--navi-text, #111827)',
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
