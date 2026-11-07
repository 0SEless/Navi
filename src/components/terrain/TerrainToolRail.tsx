'use client'

import { LAYERS_PANEL_WIDTH, MAP_CENTRE_X } from './form-styles'

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
  { id: 'boundary', label: 'Edit boundary', hint: 'Drag a corner; click + on an edge to add one; Delete removes the selected corner', key: 'e' },
]

/** Simple line icons for the dock (24 px grid). */
const ICON_PATHS: Record<TerrainTool | 'import', string> = {
  'pan': 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  'raise-lower': 'M3 20l6-9 4 5 3-4 5 8zM17 3v6M14.5 5.5L17 3l2.5 2.5',
  'smooth': 'M2 14c3-5 5-5 8 0s5 5 8 0c1-1.5 2-2 4-2',
  'flatten': 'M3 18h18M6 14h12M12 3v7M9 7l3 3 3-3',
  'slope': 'M3 19L21 7M3 19h18M21 7v12',
  'lasso': 'M12 4c5 0 9 2.5 9 6s-4 6-9 6-9-2.5-9-6 4-6 9-6zM8 15.5c-1.5 2-1 4.5 1.5 5',
  'pad': 'M4 21V9l8-5 8 5v12zM9 21v-6h6v6',
  'stairs': 'M3 20h4v-4h4v-4h4V8h4V4',
  'picker': 'M14 4l6 6M4 20l1-4 9-9 3 3-9 9zM12.5 5.5l6 6',
  'reset': 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  'contour-pen': 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  'boundary': 'M4 6l8-3 8 5-2 11-10 1z',
  'import': 'M12 3v12M7 10l5 5 5-5M4 20h16',
}

function ToolIcon({ id }: { id: TerrainTool | 'import' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      strokeDasharray={id === 'boundary' ? '3 2' : undefined}>
      <path d={ICON_PATHS[id]} />
    </svg>
  )
}

const buttonStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, padding: 0, flexShrink: 0,
  borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  border: active ? '1px solid var(--navi-primary, #2563eb)' : '1px solid transparent',
  background: active ? 'var(--navi-primary-light, #eff6ff)' : 'transparent',
  color: active ? 'var(--navi-primary, #2563eb)' : 'var(--navi-text-secondary, #4b5563)',
})

/**
 * Section 5: the terrain tools as a bottom dock, like Studio's tool dock. Each button is named by
 * its label (tooltip: label, hint and letter key); Import terrain sits at the end.
 */
export function TerrainToolRail({ tool, tools = TERRAIN_TOOLS, disabled, alwaysOn = ['pan'], onTool, onImport, importDisabled = false }: {
  tool: TerrainTool
  tools?: ToolEntry[]
  disabled: boolean
  /** Tools that stay usable without the terrain lock (stairs are free parts). */
  alwaysOn?: TerrainTool[]
  onTool: (tool: TerrainTool) => void
  /** Opens the import panel (no letter key). */
  onImport?: () => void
  importDisabled?: boolean
}) {
  return (
    <div role="toolbar" aria-label="Terrain tools" aria-orientation="horizontal" style={{
      position: 'absolute', bottom: 12, left: MAP_CENTRE_X, transform: 'translateX(-50%)', zIndex: 2, display: 'flex', alignItems: 'center', gap: 2,
      maxWidth: `calc(100% - ${LAYERS_PANEL_WIDTH + 24}px)`, overflowX: 'auto',
      padding: '3px 6px', background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      {tools.map((entry) => {
        const off = disabled && !alwaysOn.includes(entry.id)
        return (
          <button
            key={entry.id}
            type="button"
            aria-label={entry.label}
            title={`${entry.label}: ${entry.hint} (${entry.key.toUpperCase()})`}
            aria-pressed={tool === entry.id}
            disabled={off}
            onClick={() => onTool(entry.id)}
            style={buttonStyle(tool === entry.id, off)}
          >
            <ToolIcon id={entry.id} />
            <span aria-hidden style={{ position: 'absolute', right: 2, bottom: 0, fontSize: 8, fontWeight: 700, opacity: 0.55 }}>{entry.key.toUpperCase()}</span>
          </button>
        )
      })}
      {onImport && (
        <>
          <div style={{ width: 1, height: 24, background: 'var(--navi-border, #e5e7eb)', margin: '0 3px' }} />
          <button type="button" aria-label="Import terrain" title="Import terrain: a TopoExport .glb with its frame.geojson, or contour lines" disabled={importDisabled} onClick={onImport}
            style={{ ...buttonStyle(false, importDisabled), width: 'auto', gap: 6, padding: '0 10px', fontSize: 12, fontWeight: 600, color: 'var(--navi-text, #111827)' }}>
            <ToolIcon id="import" />
            Import terrain
          </button>
        </>
      )}
    </div>
  )
}
