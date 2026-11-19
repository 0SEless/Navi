import type { CampusDocument } from '@navi/core'
import { collectFloorDoors } from '@navi/core'
import type { ValidationIssue } from './snapshot'

export interface ValidationIssuePresentation {
  readonly ruleLabel: string
  readonly title: string
  readonly guidance: string
}

interface RuleCopy {
  readonly ruleLabel: string
  readonly title: string
  readonly guidance: string
}

/**
 * Owner 2026-11-19 ("the problem panel text is really vague"): every rule says what is wrong and what to do in the
 * editor, in its own words — no "Custom rule" heading and no catch-all "inspect the affected map element" line.
 */
const RULE_COPY: Record<string, RuleCopy> = {
  'route-network-disconnected': {
    ruleLabel: 'Routes',
    title: 'Route lines not joined to the rest',
    guidance: 'Draw a route from these lines to the hallway route so visitors can walk between them.',
  },
  'route-network-structure': {
    ruleLabel: 'Routes',
    title: 'Broken route line',
    guidance: 'A route line points at a route point that is missing. Delete the line and draw it again.',
  },
  'route-entrance-access': {
    ruleLabel: 'Entrances',
    title: 'Entrance not linked',
    guidance: 'Select the entrance and connect it to the hallway route inside and the outdoor walk outside.',
  },
  'route-entrance-accessibility': {
    ruleLabel: 'Entrances',
    title: 'Entrance not linked',
    guidance: 'Select the entrance and connect it to the hallway route inside and the outdoor walk outside.',
  },
  'route-room-access': {
    ruleLabel: 'Rooms',
    title: 'Room door not linked',
    guidance: 'Select the door and connect it to the hallway route.',
  },
  'route-room-unreachable': {
    ruleLabel: 'Rooms',
    title: 'Room cannot be reached',
    guidance: 'Give the room a door on its hallway side, then connect the door to the hallway route.',
  },
  'route-floor-consistency': {
    ruleLabel: 'Routes',
    title: 'Route on the wrong floor',
    guidance: 'Redraw this route on the floor it belongs to.',
  },
  'route-stair': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair route problem',
    guidance: 'Select the stair and press Auto-connect floor routes.',
  },
  'route-floor-unreachable': {
    ruleLabel: 'Floors',
    title: 'Floor cannot be reached',
    guidance: 'Join a stair or lift to the route on this floor and the floor below (Auto-connect), or link an entrance on this floor to the outdoor walk.',
  },
  'route-stair-link': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair not joined to the route',
    guidance: 'Select the stair and press Auto-connect floor routes. If it stands on one floor only, set its To floor first.',
  },
  'route-entrance-off-road': {
    ruleLabel: 'Entrances',
    title: 'Entrance link is off its road',
    guidance: 'Select the entrance and connect it to the road again.',
  },
  'route-through-wall': {
    ruleLabel: 'Routes',
    title: 'Route goes through a wall',
    guidance: 'Add a doorway in the wall where the route crosses it, or redraw the route around the wall.',
  },
  'polygon-closure': {
    ruleLabel: 'Shapes',
    title: 'Outline is not closed',
    guidance: 'Join the last point of the outline to its first point.',
  },
  'disconnected-graph': {
    ruleLabel: 'Routes',
    title: 'Separate groups of routes',
    guidance: 'Some routes are not joined to the rest. The other problems in this list say where; fix those and this one clears.',
  },
  'missing-footprint': {
    ruleLabel: 'Buildings',
    title: 'Building has no outline',
    guidance: 'Draw the building outline on the campus map.',
  },
  'orphan-reference': {
    ruleLabel: 'Links',
    title: 'Link to something deleted',
    guidance: 'Something here still points at an item that was deleted. Select it and link it again, or remove the link.',
  },
  'missing-name': {
    ruleLabel: 'Names',
    title: 'Missing name',
    guidance: 'Select it and type a name, so visitors can search for it.',
  },
  'zero-area-polygon': {
    ruleLabel: 'Shapes',
    title: 'Outline has no area',
    guidance: 'Its points lie on one line or on top of each other. Redraw the outline.',
  },
  'self-intersection': {
    ruleLabel: 'Shapes',
    title: 'Outline crosses itself',
    guidance: 'Move its points so the edges do not cross.',
  },
  'duplicate-ids': {
    ruleLabel: 'Data',
    title: 'Two items share one id',
    guidance: 'Delete one of the copies and draw it again.',
  },
  'entrance-connectivity': {
    ruleLabel: 'Entrances',
    title: 'Entrance not linked',
    guidance: 'Select the entrance and connect it to the hallway route inside and the outdoor walk outside.',
  },
  'floor-metadata': {
    ruleLabel: 'Floors',
    title: 'Floor settings missing',
    guidance: 'Open Manage Floors and give the floor a name, level and height.',
  },
  'road-connectivity': {
    ruleLabel: 'Roads',
    title: 'Road not joined',
    guidance: 'Drag the road end onto another road so the outdoor walk is one network.',
  },
  'reference': {
    ruleLabel: 'Links',
    title: 'Link to something missing',
    guidance: 'Select it and link it again, or remove the link.',
  },
  'connector-connectivity': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair or lift not joined',
    guidance: 'Select the stair or lift and press Auto-connect floor routes.',
  },
  'room-door-connectivity': {
    ruleLabel: 'Rooms',
    title: 'Door not joined to the route',
    guidance: 'Select the door and connect it to the hallway route (or draw a route to it).',
  },
  'room-door-geometry': {
    ruleLabel: 'Rooms',
    title: 'Door not on its room',
    guidance: 'Move the door onto a wall of its room.',
  },
  'feature-extent': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair or lift size problem',
    guidance: 'Select it and check its width and depth in the properties panel.',
  },
  'stair-top-reach': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair top does not reach the floor',
    guidance: 'Select the stair and press Auto-connect floor routes; it opens the wall in the way. Or change Landing exit.',
  },
  'feature-unconnected': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair or lift on one floor only',
    guidance: 'Select it and set its To floor, so visitors can use it to change floors.',
  },
  'feature-overlap': {
    ruleLabel: 'Stairs and lifts',
    title: 'Overlapping stairs or lifts',
    guidance: 'Move one of them so they no longer overlap.',
  },
  'feature-connectivity': {
    ruleLabel: 'Stairs and lifts',
    title: 'Stair or lift far from the route',
    guidance: 'Draw the hallway route up to it, or move it next to the route, then press Auto-connect floor routes.',
  },
}

function humanizeRuleId(ruleId: string): string {
  const words = ruleId
    .split(/[-_.\s]+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) return 'Validation issue'

  return words
    .map((word, index) => {
      const normalized = word.toLowerCase()
      return index === 0
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
        : normalized
    })
    .join(' ')
}

function fallbackCopy(ruleId: string): RuleCopy {
  return { ruleLabel: 'Other', title: humanizeRuleId(ruleId), guidance: '' }
}

export function presentValidationIssue(issue: ValidationIssue): ValidationIssuePresentation {
  const copy = RULE_COPY[issue.ruleId] ?? fallbackCopy(issue.ruleId)
  return { ruleLabel: copy.ruleLabel, title: copy.title, guidance: copy.guidance }
}

/** Words for the kinds of things an issue points at. */
const KIND_WORD: Record<string, string> = {
  room: 'Room', door: 'Door', staircase: 'Stair', stair: 'Stair', elevator: 'Lift', floor: 'Floor', wall: 'Wall',
  'route-edge': 'Route line', 'route-node': 'Route point', entrance: 'Entrance', road: 'Road', building: 'Building',
  opening: 'Opening', window: 'Window', hallway: 'Hallway',
}

/**
 * Where an issue is and what it points at, in the names the editor sees (owner 2026-11-19: "Building: osm-bldg-888026362
 * · Floor: flr-8-y83o" and "route-edge: route-edge-28-zbq8" told nobody anything). Unnamed things get their kind only.
 */
export function describeIssueContext(document: CampusDocument | undefined, issue: ValidationIssue): { place: string; things: string } {
  const names = new Map<string, string>()
  // The building each thing is in, for issues that only name the thing.
  const owner = new Map<string, string>()
  // The floor each thing is on (owner 2026-11-19: "add which building it is … or which floor is the problem").
  const floorOwner = new Map<string, string>()
  const buildingOf = document?.buildings?.find((b) => b.id === issue.buildingId)
  const floorOf = buildingOf?.floors.find((f) => f.id === issue.floorId) ?? document?.buildings?.flatMap((b) => b.floors).find((f) => f.id === issue.floorId)
  for (const building of document?.buildings ?? []) {
    names.set(building.id, building.name)
    for (const stair of building.staircases ?? []) {
      owner.set(stair.id, building.name)
      // A stair is on the floor that holds its flight (its top floor only holds the arrival).
      const levels = Object.keys(stair.levels ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      const flight = levels.find((level) => stair.levels[level]?.role !== 'top') ?? stair.fromLevel
      const label = building.floors.find((f) => f.level === flight)?.label
      if (label) floorOwner.set(stair.id, label)
    }
    for (const lift of building.elevators ?? []) owner.set(lift.id, building.name)
    for (const floor of building.floors) {
      names.set(floor.id, floor.label)
      owner.set(floor.id, building.name)
      floorOwner.set(floor.id, floor.label)
      const onFloor = [...(floor.rooms ?? []), ...(floor.walls ?? []), ...(floor.entrances ?? []), ...(floor.openings ?? []),
        ...(floor.routeNetwork?.nodes ?? []), ...(floor.routeNetwork?.edges ?? [])] as Array<{ id: string }>
      for (const thing of onFloor) { owner.set(thing.id, building.name); floorOwner.set(thing.id, floor.label) }
      for (const room of floor.rooms ?? []) if (room.name?.trim()) names.set(room.id, room.name.trim())
      for (const entrance of floor.entrances ?? []) {
        const label = (entrance as { label?: string }).label?.trim()
        if (label) names.set(entrance.id, label)
      }
      let doors: ReturnType<typeof collectFloorDoors> = []
      try { doors = collectFloorDoors(floor) } catch { /* a floor still being drawn: no door names */ }
      for (const door of doors) { owner.set(door.id, building.name); floorOwner.set(door.id, floor.label) }
      for (const door of doors) if (door.name?.trim() && door.name.trim().toLowerCase() !== 'door') names.set(door.id, door.name.trim())
    }
    for (const stair of building.staircases ?? []) if (stair.name?.trim()) names.set(stair.id, stair.name.trim())
    for (const lift of building.elevators ?? []) if (lift.name?.trim()) names.set(lift.id, lift.name.trim())
  }
  for (const road of document?.roads ?? []) {
    const name = (road as { name?: string }).name?.trim()
    if (name && name !== 'Untitled') names.set(road.id, name)
  }
  const building = buildingOf?.name ?? issue.targets.map((t) => owner.get(t.entityId)).find(Boolean)
  const floor = floorOf?.label ?? issue.targets.map((t) => floorOwner.get(t.entityId)).find(Boolean)
  // A problem with the routes as a whole (no building, nothing to point at) is campus-wide.
  const place = building || floor ? [building, floor].filter(Boolean).join(' · ') : issue.targets.length === 0 ? 'Whole campus' : ''
  const seen = new Set<string>()
  const things = issue.targets.flatMap((target) => {
    if (target.entityType === 'floor' || target.entityType === 'building') return []
    const word = KIND_WORD[target.entityType] ?? humanizeRuleId(target.entityType)
    const name = names.get(target.entityId)
    const text = name && name !== word ? `${word} "${name}"` : word
    if (seen.has(text)) return []
    seen.add(text)
    return [text]
  }).join(', ')
  return { place, things }
}
