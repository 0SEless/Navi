import type { Floor, LocalCoord, Opening, RoomDoor, RouteNetwork, Wall, Window } from '@navi/core'

const EPS = 1e-7
const finitePoint = (p: LocalCoord) => Number.isFinite(p.x) && Number.isFinite(p.y)
const wallLength = (w: Wall) => Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
function along(wall: Wall, p: LocalCoord): number {
  const len = wallLength(wall)
  return ((p.x - wall.start.x) * (wall.end.x - wall.start.x) + (p.y - wall.start.y) * (wall.end.y - wall.start.y)) / len
}
function point(wall: Wall, offset: number): LocalCoord {
  const len = wallLength(wall)
  return { x: wall.start.x + (wall.end.x - wall.start.x) * offset / len, y: wall.start.y + (wall.end.y - wall.start.y) * offset / len }
}

export type DoorWallProjection = { ok: true; attachment: NonNullable<RoomDoor['wallAttachment']>; position: LocalCoord; width: number; depth: number; rotation: number } | { ok: false; reason: string }
export function projectDoorToWall(wall: Wall, start: LocalCoord, end: LocalCoord, depth: number): DoorWallProjection {
  if (![wall.start, wall.end, start, end].every(finitePoint) || !Number.isFinite(wall.height) || wall.height <= 0 || !Number.isFinite(depth) || depth <= 0 || wallLength(wall) < EPS) return { ok: false, reason: 'A valid wall and positive door depth are required.' }
  const a = along(wall, start), b = along(wall, end), width = Math.abs(b - a), offset = (a + b) / 2
  if (!Number.isFinite(width) || width < 0.2 || Math.min(a,b) < -EPS || Math.max(a,b) > wallLength(wall) + EPS) return { ok: false, reason: 'The door span must be at least 0.2 m and fit inside its wall.' }
  return { ok: true, attachment: { wallId: wall.id, offset, openingHeight: Math.min(2.1, wall.height) }, position: point(wall,offset), width, depth, rotation: Math.atan2(wall.end.y-wall.start.y,wall.end.x-wall.start.x) }
}

export function deriveAttachedDoor(door: RoomDoor, wall: Wall): RoomDoor {
  const position=point(wall,door.wallAttachment!.offset), rotation=Math.atan2(wall.end.y-wall.start.y,wall.end.x-wall.start.x), depth=door.depth ?? wall.thickness
  return { ...door, position, rotation, depth, geometry: { type:'rectangle', min:{x:position.x-door.width/2,y:position.y-depth/2},max:{x:position.x+door.width/2,y:position.y+depth/2},rotation } }
}

interface Span { id:string; wallId:string; start:number; end:number; bottom:number; top:number }
function openingSpan(o:Opening):Span { return {id:o.id,wallId:o.wallId,start:o.offset,end:o.offset+o.width,bottom:o.sillHeight??(o.type==='window'?0.9:0),top:(o.sillHeight??(o.type==='window'?0.9:0))+(o.height??(o.type==='window'?1.2:2.1))} }
function windowSpan(w:Window):Span { return {id:w.id,wallId:w.wallId,start:w.offset,end:w.offset+w.width,bottom:w.sillHeight,top:w.sillHeight+1.2} }
function doorSpan(d:RoomDoor):Span { const a=d.wallAttachment!;return {id:d.id,wallId:a.wallId,start:a.offset-d.width/2,end:a.offset+d.width/2,bottom:0,top:a.openingHeight} }
function spanError(span:Span,wall:Wall):string|undefined {
  if (![span.start,span.end,span.bottom,span.top,wall.height,wallLength(wall)].every(Number.isFinite) || wallLength(wall) < EPS || span.end-span.start < 0.2-EPS || span.start < -EPS || span.end > wallLength(wall)+EPS || span.bottom < 0 || span.top <= span.bottom || span.top > wall.height+EPS) return `Attachment ${span.id} does not fit wall ${wall.id}; adjust its width or opening height first.`
}
export function validateDoorWallAttachment(floor:Floor,door:RoomDoor): {ok:true;door:RoomDoor}|{ok:false;error:string} {
  const attachment=door.wallAttachment
  if (!attachment) return {ok:true,door}
  const wall=floor.walls?.find(w=>w.id===attachment.wallId)
  if (!wall || wallLength(wall)<EPS) return {ok:false,error:`Door ${door.id} has no valid host wall ${attachment.wallId}.`}
  const span=doorSpan(door),error=spanError(span,wall)
  if(error)return {ok:false,error}
  const others=[...(floor.windows??[]).filter(w=>floor.walls?.some(wall=>wall.id===w.wallId)).map(windowSpan),...(floor.openings??[]).map(openingSpan),...(floor.doors??[]).filter(d=>d.id!==door.id&&d.wallAttachment).map(doorSpan)]
  const overlapping=others.find(other=>other.wallId===span.wallId&&Math.min(span.end,other.end)-Math.max(span.start,other.start)>EPS&&Math.min(span.top,other.top)-Math.max(span.bottom,other.bottom)>EPS)
  if(overlapping)return {ok:false,error:`Door ${door.id} overlaps attachment ${overlapping.id}.`}
  return {ok:true,door:deriveAttachedDoor(door,wall)}
}

export interface WallAttachmentState {
  doors?:RoomDoor[]
  openings?:Opening[]
  windows?:Window[]
  routeNetwork?:RouteNetwork
  present:{doors:boolean;openings:boolean;routeNetwork:boolean;windows:boolean}
}
export function snapshotWallAttachmentState(floor:Floor):WallAttachmentState {
  return {windows:structuredClone(floor.windows),doors:structuredClone(floor.doors),openings:structuredClone(floor.openings),routeNetwork:structuredClone(floor.routeNetwork),present:{windows:Object.hasOwn(floor,'windows'),doors:Object.hasOwn(floor,'doors'),openings:Object.hasOwn(floor,'openings'),routeNetwork:Object.hasOwn(floor,'routeNetwork')}}
}
export function applyWallAttachmentState(floor:Floor,state:WallAttachmentState):void {
  if(state.present.windows)floor.windows=structuredClone(state.windows);else delete floor.windows
  if(state.present.doors)floor.doors=structuredClone(state.doors);else delete floor.doors
  if(state.present.openings)floor.openings=structuredClone(state.openings);else delete floor.openings
  if(state.present.routeNetwork)floor.routeNetwork=structuredClone(state.routeNetwork);else delete floor.routeNetwork
}

/** Pure preflight. Explicit host maps preserve physical aperture spans on split/merge. */
export function prepareWallAttachmentUpdate(floor:Floor,nextWalls:Wall[],hostMap:Record<string,string[]>={}):{ok:true;state:WallAttachmentState;before:WallAttachmentState;changedDoorIds:string[]}|{ok:false;error:string} {
  const before=snapshotWallAttachmentState(floor), state=structuredClone(before), next=new Map(nextWalls.map(w=>[w.id,w])), old=new Map((floor.walls??[]).map(w=>[w.id,w]))
  const changed=(id:string)=>Object.hasOwn(hostMap,id)||JSON.stringify(old.get(id))!==JSON.stringify(next.get(id))
  function remap(span:Span):{wallId:string;start:number}|{error:string} {
    if(!changed(span.wallId))return {wallId:span.wallId,start:span.start}
    const hosts=hostMap[span.wallId]
    if(!hosts){const wall=next.get(span.wallId);if(!wall)return {error:`Wall ${span.wallId} carries attachment ${span.id}; detach it before deleting the wall.`};const error=spanError(span,wall);return error?{error}:{wallId:span.wallId,start:span.start}}
    const original=old.get(span.wallId)
    if(!original)return {error:`Original host ${span.wallId} is missing for ${span.id}.`}
    const endpoints=[point(original,span.start),point(original,span.end)]
    const fits=hosts.flatMap(id=>{
      const wall=next.get(id);if(!wall||wallLength(wall)<EPS)return []
      const offsets=endpoints.map(p=>along(wall,p)),start=Math.min(...offsets),end=Math.max(...offsets)
      if(endpoints.some((p,i)=>Math.hypot(p.x-point(wall,offsets[i]).x,p.y-point(wall,offsets[i]).y)>EPS))return []
      return spanError({...span,wallId:id,start,end},wall)?[]:[{wallId:id,start}]
    })
    return fits.length===1?fits[0]:{error:`Wall edit would split or detach attachment ${span.id}; resolve the opening first.`}
  }
  for(const opening of state.openings??[]){if(!changed(opening.wallId))continue;const mapped=remap(openingSpan(opening));if('error'in mapped)return {ok:false,error:mapped.error};opening.wallId=mapped.wallId;opening.offset=mapped.start}
  for(const window of state.windows??[]){
    // Historical composite room/hallway hosts are diagnostic-only, never guessed.
    if(!old.has(window.wallId)||!changed(window.wallId))continue
    const mapped=remap(windowSpan(window));if('error'in mapped)return {ok:false,error:mapped.error}
    window.wallId=mapped.wallId;window.offset=mapped.start
  }
  const changedDoorIds:string[]=[]
  for(let i=0;i<(state.doors?.length??0);i++){
    const door=state.doors![i];if(!door.wallAttachment||!changed(door.wallAttachment.wallId))continue
    const mapped=remap(doorSpan(door));if('error'in mapped)return {ok:false,error:mapped.error}
    door.wallAttachment={...door.wallAttachment,wallId:mapped.wallId,offset:mapped.start+door.width/2}
    const derived=deriveAttachedDoor(door,next.get(mapped.wallId)!)
    state.doors![i]=derived;changedDoorIds.push(door.id)
    const connection=door.routeConnection,network=state.routeNetwork
    if(connection&&network){const anchor=network.nodes.find(n=>n.id===connection.anchorNodeId);if(anchor){anchor.position={...derived.position};for(const edge of network.edges){if(edge.from!==anchor.id&&edge.to!==anchor.id)continue;const a=network.nodes.find(n=>n.id===edge.from),b=network.nodes.find(n=>n.id===edge.to);if(a&&b)edge.distance=Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)}}}
  }
  const spans=[...(state.windows??[]).filter(w=>next.has(w.wallId)).map(windowSpan),...(state.openings??[]).map(openingSpan),...(state.doors??[]).filter(d=>d.wallAttachment).map(doorSpan)]
  const originalSpans=[...(before.windows??[]).filter(w=>old.has(w.wallId)).map(windowSpan),...(before.openings??[]).map(openingSpan),...(before.doors??[]).filter(d=>d.wallAttachment).map(doorSpan)]
  const overlaps=(a:Span,b:Span)=>a.wallId===b.wallId&&Math.min(a.end,b.end)-Math.max(a.start,b.start)>EPS&&Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)>EPS
  for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){
    const a=spans[i],b=spans[j]
    if(!overlaps(a,b))continue
    const oldA=originalSpans.find(s=>s.id===a.id),oldB=originalSpans.find(s=>s.id===b.id)
    if(!oldA||!oldB||!overlaps(oldA,oldB))return {ok:false,error:`Wall edit would overlap attachments ${a.id} and ${b.id}.`}
  }
  return {ok:true,state,before,changedDoorIds}
}
