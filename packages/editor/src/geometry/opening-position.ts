import { mergeWalls } from './wall-topology'
import type { LocalCoord, Wall, Opening } from '@navi/core'

/**
 * Derive the authored Door direction from the original building-local clicks.
 * The result is in degrees, measured counter-clockwise from local +x/east.
 */
export function deriveDoorOrientation(start: LocalCoord, end: LocalCoord): number {
  return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
}

/**
 * W7A: Derive the absolute (x,y) position of an opening on a wall.
 * Position = wall.start + normalize(wall.end - wall.start) * opening.offset
 *
 * This is computed, never stored — the canonical opening model stores only
 * wallId + offset.
 */
export function deriveOpeningPosition(opening: Opening, wall: Wall): LocalCoord {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-10) return { ...wall.start }
  const nx = dx / len
  const ny = dy / len
  return {
    x: wall.start.x + nx * opening.offset,
    y: wall.start.y + ny * opening.offset,
  }
}

/**
 * Build the Door's visible line endpoints in building-local meters.
 *
 * Authored Doors use Opening.orientation. Legacy Doors without that field use
 * the historical Studio symbol direction: perpendicular to the parent wall.
 * Opening.width remains the canonical wall-opening width and is also the visual
 * span; no second length field is introduced here.
 */
export function deriveDoorLineEndpoints(opening: Opening, wall: Wall): [LocalCoord, LocalCoord] {
  const anchor = deriveOpeningPosition(opening, wall)
  const wallAngle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI
  const orientation = opening.orientation ?? wallAngle + 90
  const radians = orientation * Math.PI / 180
  const half = opening.width / 2
  const dx = Math.cos(radians) * half
  const dy = Math.sin(radians) * half

  return [
    { x: anchor.x - dx, y: anchor.y - dy },
    { x: anchor.x + dx, y: anchor.y + dy },
  ]
}

/**
 * W7A: Compute the offset of an opening on a wall given an absolute position.
 * Useful for migration when a wall reference changes (e.g. after split/merge).
 */
export function computeOffsetFromPosition(position: LocalCoord, wall: Wall): number {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-20) return 0
  const t = ((position.x - wall.start.x) * dx + (position.y - wall.start.y) * dy) / lenSq
  return Math.max(0, Math.min(lenSq > 0 ? Math.sqrt(lenSq) : 0, t * Math.sqrt(lenSq)))
}

/**
 * W7A: Migrate openings when a wall is split.
 * If the opening is on the original wall, it migrates to the appropriate
 * child wall with its offset rebased.
 *
 * Split point is at `splitOffset` along the original wall.
 * - Opening offset < splitOffset → stays on left child (wall-10-L)
 * - Opening offset > splitOffset → migrates to right child (wall-10-R) with rebased offset
 * - Opening offset == splitOffset → removed (at the split point)
 */
export function migrateOpeningsOnSplit(
  openings: Opening[],
  originalWallId: string,
  leftWallId: string,
  rightWallId: string,
  splitOffset: number,
): Opening[] {
  const result: Opening[] = []
  for (const opening of openings) {
    if (opening.wallId !== originalWallId) {
      result.push(opening)
      continue
    }
    const EPS = 1e-6
    if (Math.abs(opening.offset - splitOffset) < EPS) {
      // Opening is at the split point — drop it
      continue
    }
    if (opening.offset < splitOffset) {
      // Stays on left child, offset unchanged
      result.push({ ...opening, wallId: leftWallId })
    } else {
      // Migrates to right child with rebased offset
      result.push({ ...opening, wallId: rightWallId, offset: opening.offset - splitOffset })
    }
  }
  return result
}

/**
 * W7A: Migrate openings when walls are merged.
 * All openings from both walls are rebased to the merged wall.
 */
export function migrateOpeningsOnMerge(
  openings: Opening[],
  removedWallIds: string[],
  mergedWallId: string,
  wallsBefore: Array<{ id: string; start: LocalCoord; end: LocalCoord }>,
): Opening[] {
  const sourceIds = new Set([...removedWallIds, mergedWallId])
  const hosts=wallsBefore.filter(w=>sourceIds.has(w.id))
  const merged=mergeWalls(hosts)
  if(merged.length!==1)throw new Error('Opening migration requires one connected collinear merged wall')
  const target=merged[0],len=Math.hypot(target.end.x-target.start.x,target.end.y-target.start.y)
  if(!Number.isFinite(len)||len<1e-10)throw new Error('Invalid merged wall')
  return openings.map(opening=>{
    if(!sourceIds.has(opening.wallId))return opening
    const original=hosts.find(w=>w.id===opening.wallId)
    if(!original)throw new Error(`Missing opening host ${opening.wallId}`)
    const oldLength=Math.hypot(original.end.x-original.start.x,original.end.y-original.start.y)
    if(!Number.isFinite(oldLength)||oldLength<1e-10)throw new Error('Invalid original wall')
    const offsets=[opening.offset,opening.offset+opening.width].map(offset=>{
      const x=original.start.x+(original.end.x-original.start.x)*offset/oldLength
      const y=original.start.y+(original.end.y-original.start.y)*offset/oldLength
      return ((x-target.start.x)*(target.end.x-target.start.x)+(y-target.start.y)*(target.end.y-target.start.y))/len
    })
    return {...opening,wallId:mergedWallId,offset:Math.min(...offsets)}
  })
}
