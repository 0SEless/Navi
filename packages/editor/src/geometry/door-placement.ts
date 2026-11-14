import type { LocalCoord, Opening, RoomDoor, Wall } from '@navi/core'
import { projectDoorToWall } from './door-wall-attachment'

export interface WallDoorRectangle {
  min: LocalCoord
  max: LocalCoord
  center: LocalCoord
  width: number
  depth: number
  rotation: number
  points: LocalCoord[]
  wallAttachment: NonNullable<RoomDoor['wallAttachment']>
}
const along = (wall: Wall, point: LocalCoord) => {
  const length = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
  const offset = ((point.x-wall.start.x)*(wall.end.x-wall.start.x)+(point.y-wall.start.y)*(wall.end.y-wall.start.y))/length
  const position = {x:wall.start.x+(wall.end.x-wall.start.x)*offset/length,y:wall.start.y+(wall.end.y-wall.start.y)*offset/length}
  return {length,offset,distance:Math.hypot(point.x-position.x,point.y-position.y)}
}
/** Acquire once at gesture start; equal nearby candidates require another start. */
export function findPlacementWall(walls: readonly Wall[], point: LocalCoord, threshold=0.5): {ok:true;wall:Wall}|{ok:false;reason:string} {
  const candidates=walls.flatMap(wall=>{
    const hit=along(wall,point)
    if (![hit.length,hit.offset,hit.distance,wall.height,wall.thickness].every(Number.isFinite)||hit.length<=0||wall.height<=0||wall.thickness<=0||hit.offset<0||hit.offset>hit.length||hit.distance>threshold)return []
    return [{wall,distance:hit.distance}]
  }).sort((a,b)=>a.distance-b.distance)
  if(!candidates.length)return {ok:false,reason:'Start on a nearby wall to place this opening.'}
  if(candidates[1]&&candidates[1].distance-candidates[0].distance<=0.1)return {ok:false,reason:'Two walls are equally close. Start farther from the corner on the intended wall.'}
  return {ok:true,wall:structuredClone(candidates[0].wall)}
}

export function projectWallDoorRectangle(wall:Wall,start:LocalCoord,end:LocalCoord):{ok:true;rectangle:WallDoorRectangle}|{ok:false;reason:string} {
  if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) return {ok:false,reason:'The host wall needs a positive finite thickness.'}
  const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
  const perpendicularSpan=Math.abs(((end.y-start.y)*(wall.end.x-wall.start.x)-(end.x-start.x)*(wall.end.y-wall.start.y))/length)
  const projected=projectDoorToWall(wall,start,end,Math.max(wall.thickness,perpendicularSpan))
  if(!projected.ok)return projected
  const {position:center,width,depth,rotation,attachment:wallAttachment}=projected
  const min={x:center.x-width/2,y:center.y-depth/2},max={x:center.x+width/2,y:center.y+depth/2}
  const cos=Math.cos(rotation),sin=Math.sin(rotation)
  const points=[{x:-width/2,y:-depth/2},{x:width/2,y:-depth/2},{x:width/2,y:depth/2},{x:-width/2,y:depth/2}].map(point=>({x:center.x+point.x*cos-point.y*sin,y:center.y+point.x*sin+point.y*cos}))
  return {ok:true,rectangle:{min,max,center,width,depth,rotation,points,wallAttachment}}
}

/** Both clicks project onto the originally chosen host; never select a new wall. */
export function projectWallWindow(wall:Wall,start:LocalCoord,end:LocalCoord):{ok:true;opening:Pick<Opening,'type'|'wallId'|'offset'|'width'|'height'|'sillHeight'>}|{ok:false;reason:string} {
  const first=along(wall,start),last=along(wall,end),width=Math.abs(last.offset-first.offset),offset=Math.min(first.offset,last.offset)
  if (![first.length,first.offset,last.offset,last.distance,width,wall.height].every(Number.isFinite)||first.length<=0||width<0.3||offset<0||offset+width>first.length||last.distance>0.5)return {ok:false,reason:'Window must be at least 0.3 m wide, fit within its original wall, and end near that wall.'}
  if(wall.height<2.1)return {ok:false,reason:'This wall is too low for a 0.9 m sill and a 1.2 m window. Choose a taller wall or edit its height first.'}
  return {ok:true,opening:{type:'window',wallId:wall.id,offset,width,height:1.2,sillHeight:0.9}}
}
