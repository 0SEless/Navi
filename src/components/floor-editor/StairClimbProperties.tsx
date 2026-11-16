'use client'

// Floor-to-floor stair settings (2026-11-16, whole-building view), in the floor editor's properties panel: which
// floor the stair climbs To, the climb it makes (from the floors' heights, never typed), Turn and Sides.
import { useEffect, useState } from 'react'
import { stairFlightFloor, stairHasTop, stairRise, type Building } from '@navi/core'

const field: React.CSSProperties = {
  width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }
const m = (n: number) => n.toFixed(2)

type DrawingPatch = { preset?: 'straight' | 'ushape'; turn?: 'left' | 'right'; sides?: 'open' | 'railing' | 'wall'; topLandingM?: number; railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: 'posts-rails' | 'bars' | 'glass' | 'wall'; underneath?: 'open' | 'solid'; landings?: number[]; landingLengthM?: number; steepness?: 'gentle' | 'normal' | 'steep' }

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
      {props && <StairShapeControls featureId={featureId} props={props as never} onDrawing={onDrawing} />}
    </div>
  )
}

/** A number field that applies on leave or Enter (one change per edit). */
function NumberField({ id, labelText, value, onApply }: { id: string; labelText: string; value: number; onApply(value: number): void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const apply = () => {
    const n = Number(text)
    if (Number.isFinite(n) && n !== value) onApply(n)
    else setText(String(value))
  }
  return (
    <input id={id} aria-label={labelText} type="number" style={field} value={text}
      onChange={(event) => setText(event.target.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === 'Enter') apply() }} />
  )
}

/**
 * The terrain editor's stair shape controls on floor stairs (owner 2026-11-17): Underneath for every stair;
 * Steepness, Landings (resting platforms partway up, each at a % of the way) and Landing length for a Straight stair.
 */
function StairShapeControls({ featureId, props, onDrawing }: {
  featureId: string
  props: { preset?: string; underneath?: 'open' | 'solid'; landings?: number[]; landingLengthM?: number; steepness?: 'gentle' | 'normal' | 'steep'; stepWidth?: number }
  onDrawing(patch: DrawingPatch): void
}) {
  const straight = props.preset !== 'ushape'
  const landings = [...(props.landings ?? [])].sort((a, b) => a - b)
  const setLandings = (next: number[]) => onDrawing({ landings: next.filter((t) => t > 0 && t < 1).sort((a, b) => a - b) })
  return (
    <>
      <div>
        <label style={label} htmlFor={`stair-underneath-${featureId}`}>UNDERNEATH</label>
        <select id={`stair-underneath-${featureId}`} aria-label="Underneath" style={field} value={props.underneath ?? 'solid'}
          onChange={(event) => onDrawing({ underneath: event.target.value as 'open' | 'solid' })}>
          <option value="solid">Solid</option>
          <option value="open">Open</option>
        </select>
      </div>
      {straight && (
        <>
          <div>
            <label style={label} htmlFor={`stair-steepness-${featureId}`}>STEEPNESS</label>
            <select id={`stair-steepness-${featureId}`} aria-label="Steepness" style={field} value={props.steepness ?? 'normal'}
              onChange={(event) => onDrawing({ steepness: event.target.value as 'gentle' | 'normal' | 'steep' })}>
              <option value="gentle">Gentle</option>
              <option value="normal">Normal</option>
              <option value="steep">Steep</option>
            </select>
          </div>
          <div>
            <span style={label}>LANDINGS</span>
            {landings.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <NumberField id={`stair-landing-${featureId}-${i}`} labelText={`Landing ${i + 1} position (%)`} value={Math.round(t * 100)}
                  onApply={(pct) => setLandings(landings.map((x, j) => (j === i ? pct / 100 : x)))} />
                <button type="button" aria-label={`Remove landing ${i + 1}`} style={{ ...field, width: 'auto', cursor: 'pointer' }}
                  onClick={() => setLandings(landings.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" style={{ ...field, cursor: 'pointer' }}
              onClick={() => setLandings([...landings, ((landings[landings.length - 1] ?? 0) + 1) / 2])}>Add landing</button>
          </div>
          {landings.length > 0 && (
            <div>
              <label style={label} htmlFor={`stair-landing-length-${featureId}`}>LANDING LENGTH (M)</label>
              <NumberField id={`stair-landing-length-${featureId}`} labelText="Landing length (m)" value={props.landingLengthM ?? (props.stepWidth ?? 1.2)}
                onApply={(m) => { if (m > 0) onDrawing({ landingLengthM: m }) }} />
            </div>
          )}
        </>
      )}
    </>
  )
}

