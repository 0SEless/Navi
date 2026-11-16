'use client'

// Floor-to-floor stair settings (2026-11-16, whole-building view), in the floor editor's properties panel: which
// floor the stair climbs To, the climb it makes (from the floors' heights, never typed), Turn and Sides.
import { stairFlightFloor, stairHasTop, stairRise, type Building } from '@navi/core'

const field: React.CSSProperties = {
  width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }
const m = (n: number) => n.toFixed(2)

type DrawingPatch = { preset?: 'straight' | 'ushape'; turn?: 'left' | 'right'; sides?: 'open' | 'railing' | 'wall'; topLandingM?: number; railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: 'posts-rails' | 'bars' | 'glass' | 'wall' }

export function StairClimbProperties({ building, featureId, onSetTo, onDrawing }: {
  building: Building
  featureId: string
  /** Climb to this floor level (the stair's own floor = no climb). */
  onSetTo(level: number): void
  onDrawing(patch: DrawingPatch): void
}) {
  const stair = building.staircases?.find((s) => s.id === featureId)
  if (!stair) return null
  const from = stairFlightFloor(stair)
  const flight = stair.levels[from]
  const floors = [...building.floors].sort((a, b) => a.level - b.level)
  const fromFloor = floors.find((f) => f.level === from)
  // Climbing only when the upper floor really holds its top (older data may name a floor above without one).
  const toFloor = stair.toLevel > from && stairHasTop(stair) ? floors.find((f) => f.level === stair.toLevel) : undefined
  const above = floors.filter((f) => f.level > from)
  const props = flight?.drawing?.properties
  const rise = stairRise(stair, floors)
  const steps = props?.stepCount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="stair-climb-properties">
      <div>
        <label style={label} htmlFor={`stair-to-${featureId}`}>TO</label>
        <select id={`stair-to-${featureId}`} aria-label="To" style={field} value={String(toFloor ? stair.toLevel : from)}
          onChange={(event) => {
            const level = Number(event.target.value)
            if (level !== (toFloor ? stair.toLevel : from)) onSetTo(level)
          }}>
          <option value={String(from)}>{`— stays on ${fromFloor?.label ?? `Floor ${from}`} —`}</option>
          {above.map((f) => <option key={f.id} value={String(f.level)}>{f.label}</option>)}
        </select>
      </div>
      {toFloor && fromFloor && (
        <div data-testid="stair-climb" style={{ fontSize: 11, color: 'var(--navi-text)' }}>
          {`Climbs ${m(rise)} m — ${fromFloor.label} (${m(fromFloor.elevation)} m) → ${toFloor.label} (${m(toFloor.elevation)} m)`
            + (steps ? ` · ${steps} × ${(rise / steps).toFixed(3)} m` : '')}
        </div>
      )}
      {props && (
        <div>
          <label style={label} htmlFor={`stair-type-${featureId}`}>TYPE</label>
          <select id={`stair-type-${featureId}`} aria-label="Type" style={field} value={props.preset === 'ushape' ? 'ushape' : 'straight'}
            onChange={(event) => onDrawing({ preset: event.target.value as 'straight' | 'ushape' })}>
            <option value="straight">Straight</option>
            <option value="ushape">U-Shape</option>
          </select>
        </div>
      )}
      {props?.preset === 'ushape' && (
        <div>
          <label style={label} htmlFor={`stair-turn-${featureId}`}>TURN</label>
          <select id={`stair-turn-${featureId}`} aria-label="Turn" style={field} value={props.turn ?? 'right'}
            onChange={(event) => onDrawing({ turn: event.target.value as 'left' | 'right' })}>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>
      )}
      {props && (() => {
        // Railings (owner 2026-11-17: choose which side and style, like the terrain editor); an older stair's Sides
        // setting is shown the same way (open = None, railing = Both, wall = Both + Solid wall).
        const p = props as typeof props & { railings?: DrawingPatch['railings']; railingStyle?: DrawingPatch['railingStyle'] }
        const railings = p.railings ?? (p.sides === 'railing' || p.sides === 'wall' ? 'both' : 'none')
        const style = p.railingStyle ?? (p.sides === 'wall' ? 'wall' : 'posts-rails')
        return (
          <>
            <div>
              <label style={label} htmlFor={`stair-railings-${featureId}`}>RAILINGS</label>
              <select id={`stair-railings-${featureId}`} aria-label="Railings" style={field} value={railings}
                onChange={(event) => onDrawing({ railings: event.target.value as DrawingPatch['railings'] })}>
                <option value="none">None</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label style={label} htmlFor={`stair-railing-style-${featureId}`}>RAILING STYLE</label>
              <select id={`stair-railing-style-${featureId}`} aria-label="Railing style" style={field} value={style}
                onChange={(event) => onDrawing({ railingStyle: event.target.value as DrawingPatch['railingStyle'] })}>
                <option value="posts-rails">Posts and rails</option>
                <option value="bars">Bars</option>
                <option value="glass">Glass</option>
                <option value="wall">Solid wall</option>
              </select>
            </div>
          </>
        )
      })()}
    </div>
  )
}
