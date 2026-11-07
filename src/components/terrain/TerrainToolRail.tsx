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

/** `key`: the one key that selects the tool (section 4), shown on its button. */
export interface ToolEntry { id: TerrainTool; label: string; hint: string; key: string }

/** The tools available so far (later tasks add theirs to this list). */
export const TERRAIN_TOOLS: ToolEntry[] = [
  { id: 'pan', label: 'Move', hint: 'Move and tilt the view', key: 'v' },
  { id: 'raise-lower', label: 'Raise / Lower', hint: 'Hold Shift to do the opposite', key: 'b' },
  { id: 'smooth', label: 'Smooth', hint: 'Evens out bumps', key: 's' },
  { id: 'flatten', label: 'Flatten', hint: 'Holds the height where the stroke starts', key: 'f' },
  { id: 'slope', label: 'Slope', hint: 'Two points: a straight slope between their heights', key: 'p' },
  { id: 'lasso', label: 'Lasso', hint: 'Set, raise or lower everything inside an area', key: 'l' },
  { id: 'pad', label: 'Buildings', hint: 'Base height, pad and floors of a building (Shift+Z: height)', key: 'u' },
  { id: 'stairs', label: 'Stairs', hint: 'Click to place a stair, then drag its ends onto a floor edge and a road', key: 't' },
  { id: 'picker', label: 'Height picker', hint: 'Click to pick a height (or Alt+click with a brush)', key: 'h' },
  { id: 'reset', label: 'Reset', hint: 'Remove changes inside an area (back to the base)', key: 'r' },
  { id: 'contour-pen', label: 'Contour pen', hint: 'Trace height lines, then Generate surface', key: 'c' },
  { id: 'boundary', label: 'Edit boundary', hint: 'Drag a corner of the campus boundary', key: 'e' },
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
          title={`${entry.hint} (${entry.key.toUpperCase()})`}
          aria-pressed={tool === entry.id}
          disabled={disabled && !alwaysOn.includes(entry.id)}
          onClick={() => onTool(entry.id)}
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 10,
            textAlign: 'left', padding: '5px 10px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
            background: tool === entry.id ? 'var(--navi-primary, #2563eb)' : 'transparent',
            color: tool === entry.id ? 'white' : 'var(--navi-text, #111827)',
          }}
        >
          {entry.label}
          <span aria-hidden style={{ fontSize: 10, opacity: 0.55, fontWeight: 600 }}>{entry.key.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}
