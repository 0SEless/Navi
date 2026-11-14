import type { Floor, LocalCoord, RoomDoor } from '@navi/core'
import { findPlacementWall } from './door-placement'
import { validateDoorWallAttachment } from './door-wall-attachment'
import { computeOffsetFromPosition } from './opening-position'

/** Resolve a copy's fresh host placement; never persist a source attachment at
 * its old offset, which would create overlapping apertures. Legacy copies stay freeform. */
export function placeDuplicatedDoor(floor: Floor, source: RoomDoor, copy: RoomDoor, explicitOffset?: LocalCoord): {ok:true;door:RoomDoor}|{ok:false;error:string} {
  const attachment=source.wallAttachment
  if (!attachment) return {ok:true,door:copy}
  if (explicitOffset) {
    const chosen=findPlacementWall(floor.walls??[],copy.position)
    if (!chosen.ok) return {ok:false,error:chosen.reason}
    return validateDoorWallAttachment(floor,{...copy,wallAttachment:{...attachment,wallId:chosen.wall.id,offset:computeOffsetFromPosition(copy.position,chosen.wall)}})
  }
  const wall=floor.walls?.find(w=>w.id===attachment.wallId)
  if (!wall) return {ok:false,error:'The source door host wall is missing. Repair its attachment before duplicating.'}
  const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
  const half=copy.width/2, gap=.2
  const candidates=[attachment.offset+copy.width+gap,attachment.offset-copy.width-gap,half,length-half]
  const spans=[
    ...(floor.doors??[]).filter(d=>d.wallAttachment?.wallId===wall.id).map(d=>({start:d.wallAttachment!.offset-d.width/2,end:d.wallAttachment!.offset+d.width/2})),
    ...(floor.openings??[]).filter(o=>o.wallId===wall.id).map(o=>({start:o.offset,end:o.offset+o.width})),
    ...(floor.windows??[]).filter(w=>w.wallId===wall.id).map(w=>({start:w.offset,end:w.offset+w.width})),
  ]
  for (const span of spans) candidates.push(span.end+half+gap,span.start-half-gap)
  candidates.sort((a,b)=>Math.abs(a-attachment.offset)-Math.abs(b-attachment.offset)||b-a)
  for (const offset of candidates) {
    const result=validateDoorWallAttachment(floor,{...copy,wallAttachment:{...attachment,offset}})
    if (result.ok) return result
  }
  // Clearance is a placement preference, not a validity rule. An exact-fit
  // interval between existing openings remains usable when room is tight.
  const tightCandidates=spans.flatMap(span=>[span.end+half,span.start-half])
    .sort((a,b)=>Math.abs(a-attachment.offset)-Math.abs(b-attachment.offset)||b-a)
  for (const offset of tightCandidates) {
    const result=validateDoorWallAttachment(floor,{...copy,wallAttachment:{...attachment,offset}})
    if (result.ok) return result
  }
  return {ok:false,error:'No free span on this wall fits the duplicated door. Free space or adjust its width before duplicating.'}
}
