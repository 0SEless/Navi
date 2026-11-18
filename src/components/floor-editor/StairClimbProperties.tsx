'use client'

// Floor-to-floor stair settings (2026-11-16, whole-building view), in the floor editor's properties panel: which
// floor the stair climbs To, the climb it makes (from the floors' heights, never typed), Turn and Sides.
import { useEffect, useState } from 'react'
import { StairCutout } from './StairCutout'
import { stairTopReach } from '@navi/editor/src/geometry/stair-top-reach'
import { stairFlightFloor, stairHasTop, stairRise, stairTopShape, type Building, type StairLandingExit } from '@navi/core'

const field: React.CSSProperties = {
  width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }
const m = (n: number) => n.toFixed(2)

type RailingStyle = 'posts-rails' | 'bars' | 'glass' | 'wall' | 'half-wall'
type LookPatch = { topLandingM?: number | null; railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: RailingStyle; underneath?: 'open' | 'solid' }
type DrawingPatch = { preset?: 'straight' | 'ushape'; turn?: 'left' | 'right'; sides?: 'open' | 'railing' | 'wall'; topLandingM?: number; railings?: 'none' | 'left' | 'right' | 'both'; railingStyle?: RailingStyle; platformRailingStyle?: 'same' | 'none' | RailingStyle; underneath?: 'open' | 'solid'; landings?: number[]; landingLengthM?: number; landingHeightsM?: Array<number | null>; steepness?: 'gentle' | 'normal' | 'steep' }

export function StairClimbProperties({ building, featureId, onSetTo, onLandingExit, onCutout, onConnectFloors, onDrawing, onLook, outdoor, onConnectOutdoor, onDisconnectOutdoor }: {
  building: Building
  featureId: string
  /** Climb to this floor level (the stair's own floor = no climb). */
  onSetTo(level: number): void
  onLandingExit?(side: StairLandingExit | 'auto'): void
  onCutout?(cutout: { wallId: string; offset: number; width: number }): { success: boolean; error?: string }
  onConnectFloors?(): void
  onDrawing(patch: DrawingPatch): void
  /** A stair without a design (drawn with the Stair tool): its railings and underneath (2026-11-17). */
  onLook?(patch: LookPatch): void
  /** The stair's link to the outdoor route network, from its foot (owner 2026-11-18). */
  outdoor?: { connected: boolean; label: string | null; hasEntrance?: boolean }
  /** Open the outdoor route picker for the stair's foot. */
  onConnectOutdoor?(): void
  /** "None": no outdoor link. */
  onDisconnectOutdoor?(): void
}) {
  const stair = building.staircases?.find((s) => s.id === featureId)
  if (!stair) return null
  const from = stairFlightFloor(stair)
  const flight = stair.levels[from]
  const floors = [...building.floors].sort((a, b) => a.level - b.level)
  const fromFloor = floors.find((f) => f.level === from)
  // Climbing only when the upper floor really holds its top (older data may name a floor above without one).
  const toFloor = stair.toLevel > from && stairHasTop(stair) ? floors.find((f) => f.level === stair.toLevel) : undefined
  const reach = toFloor && onLandingExit ? stairTopReach(building, stair) : undefined
  const above = floors.filter((f) => f.level > from)
  const nextFloor = above[0]
  const props = flight?.drawing?.properties
  const rise = stairRise(stair, floors)
  const steps = props?.stepCount
  const usesExistingPlatform = toFloor && flight && !props &&
    stairTopShape({ id: featureId, ...flight, height: rise, fromLevel: from })?.integrated

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
      {!toFloor && nextFloor && (
        <button type="button" style={{ ...field, cursor: 'pointer' }} onClick={() => onSetTo(nextFloor.level)}>
          Connect to {nextFloor.label}
        </button>
      )}
      {toFloor && fromFloor && (
        <div data-testid="stair-climb" style={{ fontSize: 11, color: 'var(--navi-text)' }}>
          {`Climbs ${m(rise)} m — ${fromFloor.label} (${m(fromFloor.elevation)} m) → ${toFloor.label} (${m(toFloor.elevation)} m)`
            + (steps ? ` · ${steps} × ${(rise / steps).toFixed(3)} m` : '')}
        </div>
      )}
      {toFloor && onLandingExit && (
        <div>
          <label style={label} htmlFor={`stair-exit-${featureId}`}>LANDING EXIT</label>
          <select id={`stair-exit-${featureId}`} style={field} value={flight?.landingExit ?? 'auto'}
            onChange={event => onLandingExit(event.target.value as StairLandingExit | 'auto')}>
            <option value="auto">Auto</option>
            <option value="front">Front</option>
            <option value="left">Left side</option>
            <option value="right">Right side</option>
          </select>
          <div style={{ ...label, marginTop: 4 }}>Left and right are as you walk up the final flight.</div>
          {reach && !reach.ok && (
            <div role="status" style={label}>
              {reach.reason === 'no-opening'
                ? `The landing meets a wall on ${toFloor.label}. Place an opening on the hallway side.`
                : usesExistingPlatform
                  ? `Connect ${toFloor.label}'s hallway route to the existing platform edge.`
                  : `The landing does not reach ${toFloor.label}'s hallway. Check the landing exit.`}
            </div>
          )}
          {reach?.ok && !flight?.landingExit && stair.levels[toFloor.level]?.landingExit && (
            <div style={label}>Auto selected: {stair.levels[toFloor.level].landingExit}</div>
          )}
          {usesExistingPlatform && <div style={label}>Uses the existing stair platform.</div>}
          {!usesExistingPlatform && !props && onLook && (
            <label style={label}>
              Arrival landing depth (m)
              <OptionalNumberField id={`stair-arrival-depth-${featureId}`} labelText="Arrival landing depth (m)"
                value={flight?.look?.topLandingM ?? null}
                onApply={value => { if (value === null || value >= 0.5) onLook({ topLandingM: value }) }} />
            </label>
          )}
          {onCutout && <StairCutout key={toFloor.id + (flight?.landingExit ?? 'auto')} building={building} stair={stair} onApply={onCutout} />}
          {onConnectFloors && (
            <button type="button" style={{ ...field, cursor: 'pointer' }} onClick={onConnectFloors}>Auto-connect floor routes</button>
          )}
          <div style={{ ...label, marginTop: 4 }}>
            {fromFloor?.label}: {flight?.routeConnection ? 'Route linked' : 'No floor route linked'} · {toFloor.label}: {stair.levels[toFloor.level]?.routeConnection ? 'Route linked' : 'No floor route linked'}
          </div>
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
                <option value="half-wall">Half wall + rail</option>
              </select>
            </div>
            {props.preset === 'ushape' && (
              <div>
                <label style={label} htmlFor={`stair-platform-railing-${featureId}`}>TURN LANDING RAILING</label>
                <select id={`stair-platform-railing-${featureId}`} aria-label="Platform railing" style={field}
                  value={(p as { platformRailingStyle?: string }).platformRailingStyle ?? 'same'}
                  onChange={(event) => onDrawing({ platformRailingStyle: event.target.value as DrawingPatch['platformRailingStyle'] })}>
                  <option value="same">Same as stair</option>
                  <option value="none">None</option>
                  <option value="posts-rails">Posts and rails</option>
                  <option value="half-wall">Half wall + rail</option>
                  <option value="wall">Solid wall</option>
                </select>
              </div>
            )}
          </>
        )
      })()}
      {props && <StairShapeControls featureId={featureId} props={props as never} onDrawing={onDrawing} />}
      {!props && flight && onLook && <ToolStairLook featureId={featureId} look={flight.look} onLook={onLook} />}
      {onConnectOutdoor && (
        <div>
          <span style={label}>OUTDOOR ROUTE</span>
          <div data-testid="stair-outdoor" style={{ fontSize: 11, color: 'var(--navi-text)' }}>
            {outdoor?.connected ? `Connected to ${outdoor.label ?? 'an outdoor route'}` : 'Not connected'}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button type="button" style={{ ...field, cursor: 'pointer' }} onClick={onConnectOutdoor}>
              {outdoor?.connected ? 'Change…' : 'Connect…'}
            </button>
            {(outdoor?.connected || outdoor?.hasEntrance) && onDisconnectOutdoor && (
              <button type="button" style={{ ...field, width: 'auto', cursor: 'pointer' }} onClick={onDisconnectOutdoor}>None</button>
            )}
          </div>
        </div>
      )}
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
  props: { preset?: string; underneath?: 'open' | 'solid'; landings?: number[]; landingLengthM?: number; landingHeightsM?: Array<number | null>; steepness?: 'gentle' | 'normal' | 'steep'; stepWidth?: number; topLandingM?: number }
  onDrawing(patch: DrawingPatch): void
}) {
  const straight = props.preset !== 'ushape'
  // Landings keep their stored order so each one's height stays with it.
  const landings = props.landings ?? []
  const heights = props.landingHeightsM
  const setLandings = (next: number[]) => onDrawing({ landings: next.filter((t) => t > 0 && t < 1) })
  const removeLanding = (i: number) => onDrawing({ landings: landings.filter((_, j) => j !== i), ...(heights ? { landingHeightsM: heights.filter((_, j) => j !== i) } : {}) })
  const addLanding = () => onDrawing({ landings: [...landings, ((Math.max(0, ...landings)) + 1) / 2], ...(heights ? { landingHeightsM: [...heights, null] } : {}) })
  const setHeight = (i: number, h: number | null) => onDrawing({ landingHeightsM: landings.map((_, j) => (j === i ? h : heights?.[j] ?? null)) })
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
      <div>
        <label style={label} htmlFor={`stair-top-landing-${featureId}`}>TOP LANDING LENGTH (M)</label>
        <NumberField id={`stair-top-landing-${featureId}`} labelText="Top landing length (m)" value={props.topLandingM ?? (props.stepWidth ?? 1.2)}
          onApply={(m) => { if (m > 0) onDrawing({ topLandingM: m }) }} />
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
                <OptionalNumberField id={`stair-landing-h-${featureId}-${i}`} labelText={`Landing ${i + 1} height (m)`} value={heights?.[i] ?? null}
                  onApply={(h) => setHeight(i, h)} />
                <button type="button" aria-label={`Remove landing ${i + 1}`} style={{ ...field, width: 'auto', cursor: 'pointer' }}
                  onClick={() => removeLanding(i)}>Remove</button>
              </div>
            ))}
            <button type="button" style={{ ...field, cursor: 'pointer' }}
              onClick={addLanding}>Add landing</button>
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

/** A number field that may be left blank (automatic); applies on leave or Enter. */
function OptionalNumberField({ id, labelText, value, onApply }: { id: string; labelText: string; value: number | null; onApply(value: number | null): void }) {
  const shown = value === null ? '' : String(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const apply = () => {
    const next = text.trim() === '' ? null : Number(text)
    if (next !== null && !Number.isFinite(next)) { setText(shown); return }
    if (next !== value) onApply(next)
  }
  return (
    <input id={id} aria-label={labelText} type="number" placeholder="auto" style={field} value={text}
      onChange={(event) => setText(event.target.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === 'Enter') apply() }} />
  )
}

/**
 * A stair drawn with the Stair tool (no design; ASU's stairs, owner 2026-11-17): Railings, their style and Underneath.
 * Defaults match how it is drawn: a half wall with a rail on both sides, solid underneath.
 */
function ToolStairLook({ featureId, look, onLook }: { featureId: string; look?: LookPatch; onLook(patch: LookPatch): void }) {
  return (
    <>
      <div>
        <label style={label} htmlFor={`stair-railings-${featureId}`}>RAILINGS</label>
        <select id={`stair-railings-${featureId}`} aria-label="Railings" style={field} value={look?.railings ?? 'both'}
          onChange={(event) => onLook({ railings: event.target.value as LookPatch['railings'] })}>
          <option value="none">None</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div>
        <label style={label} htmlFor={`stair-railing-style-${featureId}`}>RAILING STYLE</label>
        <select id={`stair-railing-style-${featureId}`} aria-label="Railing style" style={field} value={look?.railingStyle ?? 'half-wall'}
          onChange={(event) => onLook({ railingStyle: event.target.value as RailingStyle })}>
          <option value="half-wall">Half wall + rail</option>
          <option value="wall">Solid wall</option>
          <option value="posts-rails">Posts and rails</option>
        </select>
      </div>
      <div>
        <label style={label} htmlFor={`stair-underneath-${featureId}`}>UNDERNEATH</label>
        <select id={`stair-underneath-${featureId}`} aria-label="Underneath" style={field} value={look?.underneath ?? 'solid'}
          onChange={(event) => onLook({ underneath: event.target.value as 'open' | 'solid' })}>
          <option value="solid">Solid</option>
          <option value="open">Open</option>
        </select>
      </div>
    </>
  )
}
