import type { NavRoute } from '@/types/route-types'

/**
 * Readable directions (owner 2026-11-18, user app review): the route has one point per graph node, so it used to read
 * "walk to N-617" 28 times for a 191 m walk. Directions group those points into a few real steps — walk, turn, enter
 * or leave a building, stairs or elevator, arrive — with rounded distances and real names, never route point ids.
 *
 * A direction starts at a route point (`start`, an index into route.steps) and covers the segments up to the next
 * direction's start; starts are strictly increasing, so every route point belongs to exactly one direction.
 */

export type DirectionKind = 'walk' | 'turn-left' | 'turn-right' | 'enter' | 'exit' | 'stairs' | 'elevator' | 'arrive'

export interface RouteDirection {
  kind: DirectionKind
  /** Index of the route step where this direction begins. */
  start: number
  text: string
  /** Metres covered by this direction. */
  distance: number
}

export interface DirectionNames {
  /** A building's display name. */
  building?: (buildingId: string) => string | undefined
  /** What to call the destination ("CS201", "ComDev Building"). */
  destination?: string
}

/** Turns smaller than this (degrees) are just "keep walking". */
const TURN_DEG = 35
/** Segments shorter than this (metres) never count as a turn. */
const SHORT_M = 1.5

/** Route point ids ("N-112", "wp-3") and the node's own id are not names a person can use. */
export function isReadablePlaceName(label: string | undefined | null, nodeId?: string): boolean {
  const text = (label ?? '').trim()
  if (!text || text === nodeId) return false
  return !/^(n|wp|node|pt)[-_ ]?\d+$/i.test(text)
}

/** The name to show for a route point: its own name, else the place search knows it as, else its building. */
export function readablePlaceLabel(input: { nodeLabel?: string | null; nodeId?: string | null; entryLabel?: string | null; buildingName?: string | null; fallback?: string }): string {
  if (isReadablePlaceName(input.nodeLabel, input.nodeId ?? undefined)) return input.nodeLabel!.trim()
  if (isReadablePlaceName(input.entryLabel)) return input.entryLabel!.trim()
  if (isReadablePlaceName(input.buildingName)) return input.buildingName!.trim()
  return input.fallback ?? 'Your destination'
}

/** Instruction type for a direction (the route contract's types). */
export function directionInstructionType(kind: DirectionKind): 'walk' | 'stairs' | 'elevator' | 'turn_left' | 'turn_right' | 'arrive' {
  return kind === 'turn-left' ? 'turn_left' : kind === 'turn-right' ? 'turn_right' : kind === 'stairs' || kind === 'elevator' || kind === 'arrive' ? kind : 'walk'
}

/** Floor level as shown on the map's floor picker: 0 → GF, 1 → 1F, -1 → B1. */
export function floorLabel(level: number): string {
  if (level === 0) return 'GF'
  return level > 0 ? `${level}F` : `B${-level}`
}

type Segment = { k: number; kind: 'move' | 'enter' | 'exit' | 'vertical'; length: number; dx: number; dy: number }

function segments(route: NavRoute): Segment[] {
  const out: Segment[] = []
  const steps = route.steps
  for (let k = 1; k < steps.length; k++) {
    const a = steps[k - 1], b = steps[k]
    const lat = ((a.position.lat + b.position.lat) / 2) * Math.PI / 180
    const dx = (b.position.lng - a.position.lng) * 111320 * Math.cos(lat)
    const dy = (b.position.lat - a.position.lat) * 111320
    const length = route.instructions[k]?.distance ?? Math.hypot(dx, dy)
    // Entering or leaving comes first: a hillside building can be entered straight onto an upper floor, which is not
    // a stair. Only a floor change inside the building is stairs or an elevator.
    const kind = !a.buildingId && b.buildingId ? 'enter' : a.buildingId && !b.buildingId ? 'exit' : a.floor !== b.floor ? 'vertical' : 'move'
    out.push({ k, kind, length, dx, dy })
  }
  return out
}

/** Signed turn from heading a to heading b: positive = left, degrees. */
function turnDeg(a: { dx: number; dy: number }, b: { dx: number; dy: number }): number {
  return (Math.atan2(a.dx * b.dy - a.dy * b.dx, a.dx * b.dx + a.dy * b.dy) * 180) / Math.PI
}

type Draft = { kind: DirectionKind; start: number }

function draftDirections(route: NavRoute): Draft[] {
  const n = route.steps.length
  if (n === 0) return []
  const drafts: Draft[] = [{ kind: 'walk', start: 0 }]
  let heading: { dx: number; dy: number } | null = null
  const open = (kind: DirectionKind, start: number) => {
    const last = drafts[drafts.length - 1]
    // Never two directions at one point: the later one wins (it says what to do from here).
    if (last.start >= start) { last.kind = kind; last.start = Math.max(last.start, start) } else drafts.push({ kind, start })
  }
  for (const s of segments(route)) {
    const current = drafts[drafts.length - 1]
    if (s.kind === 'vertical') {
      if (current.kind !== 'stairs' && current.kind !== 'elevator') {
        open(route.steps[s.k].type === 'elevator' || route.steps[s.k - 1].type === 'elevator' ? 'elevator' : 'stairs', s.k - 1)
      }
      heading = null // people turn around on stairs; the next walk starts fresh
      continue
    }
    if (s.kind === 'enter' || s.kind === 'exit') {
      open(s.kind, s.k - 1)
      if (s.length >= SHORT_M) heading = { dx: s.dx, dy: s.dy }
      continue
    }
    // An ordinary walking segment.
    const afterSpecial = current.kind !== 'walk' && !current.kind.startsWith('turn')
    if (s.length < SHORT_M) {
      if (afterSpecial) open('walk', s.k - 1)
      continue
    }
    const turn = heading ? turnDeg(heading, s) : 0
    if (Math.abs(turn) > TURN_DEG) open(turn > 0 ? 'turn-left' : 'turn-right', s.k - 1)
    else if (afterSpecial) open('walk', s.k - 1)
    heading = { dx: s.dx, dy: s.dy }
  }
  open('arrive', n - 1)
  return drafts
}

/** Where each direction starts (route step indexes, strictly increasing). Needs no names. */
export function directionStarts(route: NavRoute | null): number[] {
  return route ? draftDirections(route).map((d) => d.start) : []
}

/** The direction a route step belongs to (index into the directions). */
export function directionAt(route: NavRoute | null, stepIndex: number): number {
  const starts = directionStarts(route)
  let found = 0
  for (let i = 0; i < starts.length; i++) if (starts[i] <= stepIndex) found = i
  return found
}

const about = (metres: number) => {
  const m = metres < 10 ? Math.max(1, Math.round(metres)) : Math.round(metres / 5) * 5
  return `about ${m} m`
}

/** The readable directions for a route. */
export function describeDirections(route: NavRoute | null, names: DirectionNames = {}): RouteDirection[] {
  if (!route) return []
  const drafts = draftDirections(route)
  const steps = route.steps
  const buildingName = (id: string | undefined) => (id ? names.building?.(id) : undefined) ?? 'the building'
  return drafts.map((d, i) => {
    const end = i + 1 < drafts.length ? drafts[i + 1].start : d.start
    let distance = 0
    for (let k = d.start + 1; k <= end; k++) distance += route.instructions[k]?.distance ?? 0
    const to = steps[end] ?? steps[d.start]
    let text: string
    switch (d.kind) {
      case 'walk': text = `Walk ${about(distance)}`; break
      case 'turn-left': text = `Turn left and walk ${about(distance)}`; break
      case 'turn-right': text = `Turn right and walk ${about(distance)}`; break
      // A long walk up to the door is part of the same step: "Walk about 120 m and enter …".
      case 'enter': text = distance >= 10 ? `Walk ${about(distance)} and enter ${buildingName(to?.buildingId)}` : `Enter ${buildingName(to?.buildingId)}`; break
      case 'exit': text = `Leave ${buildingName(steps[d.start]?.buildingId)}`; break
      case 'stairs': text = `Take the stairs ${(to?.floor ?? 0) >= (steps[d.start]?.floor ?? 0) ? 'up' : 'down'} to ${floorLabel(to?.floor ?? 0)}`; break
      case 'elevator': text = `Take the elevator to ${floorLabel(to?.floor ?? 0)}`; break
      default: {
        const last = steps[steps.length - 1]
        const place = names.destination && isReadablePlaceName(names.destination) ? names.destination
          : isReadablePlaceName(last?.label, last?.nodeId) ? last!.label : 'your destination'
        text = `Arrive at ${place}`
      }
    }
    return { kind: d.kind, start: d.start, text, distance }
  })
}
