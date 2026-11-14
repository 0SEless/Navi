'use client'
import { GLASS_STYLES, OPENING_MATERIAL_COLORS, buildOpeningPlanSymbols, type DoorPreset, type WindowPreset, type Wall } from '@navi/core'

/** Synthetic host: a 1 m opening centred on a 1.4 m wall, 0.2 m thick. */
const WALL_LENGTH = 1.4
const WALL = { id: 'thumb-wall', start: { x: 0, y: 0 }, end: { x: WALL_LENGTH, y: 0 }, height: 3, thickness: 0.2 } as Wall
const FALLBACK_PANEL = '#a88463'
const FRAME = '#334155'
const isWindow = (preset: DoorPreset | WindowPreset): preset is WindowPreset => 'type' in preset

/**
 * Small picture of a preset: plan symbol (from the real symbol builder) above a front elevation.
 * Decorative; the accessible name is the preset label.
 */
export function OpeningThumbnail({ preset, size = 64 }: { preset: DoorPreset | WindowPreset; size?: number }) {
  const asWindow = isWindow(preset)
  const symbols = asWindow
    ? buildOpeningPlanSymbols([WALL], [{ id: 'thumb', type: 'window', wallId: WALL.id, offset: 0.2, width: 1, assetPreset: preset.id }], [])
    : buildOpeningPlanSymbols([WALL], [], [{ id: 'thumb', width: 1, doorType: 'standard', assetPreset: preset.id, wallAttachment: { wallId: WALL.id, offset: WALL_LENGTH / 2, openingHeight: 2.1 } }] as never)
  // Plan: local metres -> top half. y up in plan, down in SVG; door swings (up to 1 m) must fit.
  const planScale = size / (WALL_LENGTH + 0.2), planMid = size * 0.25
  const px = (x: number) => (x + 0.1) * planScale
  const py = (y: number) => planMid - y * planScale * (asWindow ? 0.5 : 0.22)
  const lines = symbols.lines.features.map(f => ({ kind: String(f.properties?.kind), points: f.geometry.coordinates.map(([x, y]) => `${px(x).toFixed(2)},${py(y).toFixed(2)}`).join(' ') }))
  const dashed = (kind: string) => kind === 'arc' || kind === 'shutter' || kind === 'window-swing'
  return <svg role="img" aria-label={preset.label} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
    <line x1={0} y1={planMid} x2={px(0.2)} y2={planMid} stroke={FRAME} strokeWidth={3} />
    <line x1={px(1.2)} y1={planMid} x2={size} y2={planMid} stroke={FRAME} strokeWidth={3} />
    {lines.map((l, i) => <polyline key={i} data-kind={l.kind} points={l.points} fill="none" stroke={dashed(l.kind) ? '#64748b' : FRAME}
      strokeWidth={dashed(l.kind) || l.kind === 'window-hatch' ? 0.8 : 1.4} strokeDasharray={dashed(l.kind) ? '2 2' : undefined} />)}
    {asWindow ? <WindowElevation preset={preset} size={size} /> : <DoorElevation preset={preset} size={size} />}
  </svg>
}

function DoorElevation({ preset, size }: { preset: DoorPreset; size: number }) {
  const ex = size * 0.25, ew = size * 0.5, ey = size * 0.55, eh = size * 0.42
  const material = preset.material ? OPENING_MATERIAL_COLORS[preset.material] : FALLBACK_PANEL
  const glass = GLASS_STYLES[preset.glass]
  const fill = preset.panel === 'glass' ? glass.color : preset.panel === 'none' ? 'none' : material
  const fillOpacity = preset.panel === 'glass' ? glass.opacity + 0.2 : 1
  const slats = preset.operation === 'rolling' ? Array.from({ length: 5 }, (_, i) => ey + eh * (i + 1) / 6) : []
  const folds = preset.operation === 'folding' ? [1, 2, 3].map(i => ex + ew * i / 4) : []
  return <>
    <rect x={ex} y={ey} width={ew} height={eh} fill={fill} fillOpacity={fillOpacity} stroke={FRAME} strokeWidth={1.5} />
    {preset.panel === 'half-glass' && <rect x={ex + 3} y={ey + 3} width={ew - 6} height={eh / 2 - 4} fill={glass.color} fillOpacity={glass.opacity + 0.2} stroke={FRAME} strokeWidth={0.8} />}
    {preset.leaves === 2 && <line x1={ex + ew / 2} y1={ey} x2={ex + ew / 2} y2={ey + eh} stroke={FRAME} strokeWidth={1} />}
    {slats.map((y, i) => <line key={i} x1={ex} y1={y} x2={ex + ew} y2={y} stroke={FRAME} strokeWidth={0.6} />)}
    {folds.map((x, i) => <line key={i} x1={x} y1={ey} x2={x} y2={ey + eh} stroke={FRAME} strokeWidth={0.6} />)}
    {preset.fire && <circle cx={ex + ew / 2} cy={ey + eh * 0.6} r={size * 0.12} fill="#FFFFFF" />}
    {preset.fire && <text x={ex + ew / 2} y={ey + eh * 0.68} textAnchor="middle" fontSize={size * 0.22} fontWeight={700} fill={OPENING_MATERIAL_COLORS['fire-red']} stroke="#FFFFFF" strokeWidth={0.6}>F</text>}
  </>
}

function WindowElevation({ preset, size }: { preset: WindowPreset; size: number }) {
  // Transoms are short and high; everything else fills a square-ish aperture.
  const ex = size * 0.2, ew = size * 0.6, ey = preset.type === 'transom' ? size * 0.55 : size * 0.58, eh = preset.type === 'transom' ? size * 0.14 : size * 0.38
  const frame = preset.material ? OPENING_MATERIAL_COLORS[preset.material] : FRAME
  const glass = GLASS_STYLES[preset.glass]
  const glazed = preset.type !== 'open' && preset.type !== 'vent-block'
  const line = (x1: number, y1: number, x2: number, y2: number, extra: Record<string, unknown> = {}) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={frame} strokeWidth={0.8} {...extra} />
  return <>
    <rect x={ex} y={ey} width={ew} height={eh} fill={glazed ? glass.color : preset.type === 'vent-block' ? '#E5E7EB' : 'none'} fillOpacity={glazed ? glass.opacity + 0.2 : 1} stroke={frame} strokeWidth={1.5} />
    {preset.type === 'two-pane' && line(ex + ew / 2, ey, ex + ew / 2, ey + eh)}
    {preset.type === 'sliding' && <rect x={ex + ew * 0.45} y={ey + 2} width={ew * 0.55 - 2} height={eh - 4} fill="none" stroke={frame} strokeWidth={0.8} />}
    {preset.type === 'casement' && <>{line(ex + ew / 2, ey, ex + ew / 2, ey + eh, { strokeWidth: 1.4 })}
      {line(ex + ew / 2, ey, ex, ey + eh / 2, { strokeDasharray: '2 2' })}{line(ex, ey + eh / 2, ex + ew / 2, ey + eh, { strokeDasharray: '2 2' })}
      {line(ex + ew / 2, ey, ex + ew, ey + eh / 2, { strokeDasharray: '2 2' })}{line(ex + ew, ey + eh / 2, ex + ew / 2, ey + eh, { strokeDasharray: '2 2' })}</>}
    {preset.type === 'awning' && <>{line(ex, ey + eh / 2, ex + ew, ey + eh / 2, { strokeWidth: 1.4 })}
      {line(ex, ey + eh / 2, ex + ew / 2, ey, { strokeDasharray: '2 2' })}{line(ex + ew / 2, ey, ex + ew, ey + eh / 2, { strokeDasharray: '2 2' })}
      {line(ex, ey + eh, ex + ew / 2, ey + eh / 2, { strokeDasharray: '2 2' })}{line(ex + ew / 2, ey + eh / 2, ex + ew, ey + eh, { strokeDasharray: '2 2' })}</>}
    {preset.type === 'transom' && <>{line(ex, ey + eh - 1.5, ex + ew, ey + eh - 1.5, { strokeWidth: 3 })}
      {line(ex + ew / 3, ey, ex + ew / 3, ey + eh)}{line(ex + ew * 2 / 3, ey, ex + ew * 2 / 3, ey + eh)}</>}
    {preset.type === 'jalousie' && Array.from({ length: 7 }, (_, i) => <line key={i} data-part="slat" x1={ex} y1={ey + eh * (i + 1) / 8} x2={ex + ew} y2={ey + eh * (i + 1) / 8 - 2} stroke={frame} strokeWidth={0.8} />)}
    {preset.type === 'vent-block' && <>{[1, 2, 3].map(i => <line key={'v' + i} x1={ex + ew * i / 4} y1={ey} x2={ex + ew * i / 4} y2={ey + eh} stroke={FRAME} strokeWidth={1.2} />)}
      {[1, 2, 3].map(i => <line key={'h' + i} x1={ex} y1={ey + eh * i / 4} x2={ex + ew} y2={ey + eh * i / 4} stroke={FRAME} strokeWidth={1.2} />)}</>}
  </>
}
