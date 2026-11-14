import {collectFloorDoors} from '@navi/core'
import type { Building, Floor, LocalCoord, RoomDoor } from '@navi/core'
import { deriveAttachedDoor } from './door-wall-attachment'
export type FloorPortKind='door'|'entrance'|'stair'|'elevator'
export interface FloorPort { key:string; kind:FloorPortKind; id:string; label:string; position:LocalCoord; hostWallId?:string; connection?:RoomDoor['routeConnection']; manualConnected?:boolean; issue?:string
 /** Old imported doors carry no wall attachment. The wall they sit in (nearest, within `ownWallReach`)
  * may be crossed at the very start of their link, like an attached door's host wall. */
 ownWallId?:string; ownWallReach?:number }
/** Distance from a point to a wall's centre line. */
function distanceToWall(point:LocalCoord,wall:{start:LocalCoord;end:LocalCoord}):number{const q=projectFloorPoint(point,wall.start,wall.end);return Math.hypot(q.x-point.x,q.y-point.y)}
/** The single wall an unattached door sits in: the nearest wall whose centre line is within half the door depth
 * plus half the wall thickness plus 15 cm (old imports sit up to ~15 cm off the centre line). */
export function ownWallOf(door:Pick<RoomDoor,'position'|'depth'>,floor:Pick<Floor,'walls'>):{id:string;reach:number}|undefined{
 let best:{id:string;reach:number;distance:number}|undefined
 for(const wall of floor.walls??[]){
  const reach=(Number.isFinite(door.depth)&&door.depth!>0?door.depth!:.2)/2+wall.thickness/2+.15,distance=distanceToWall(door.position,wall)
  if(Number.isFinite(distance)&&distance<=reach&&(!best||distance<best.distance))best={id:wall.id,reach,distance}
 }
 return best&&{id:best.id,reach:best.reach}
}
export interface FloorConnectionTarget { edgeId:string; position:LocalCoord }
export interface FloorConnectionProposal {portKey:string;target?:FloorConnectionTarget;accepted:boolean;existing?:boolean;disconnect?:boolean;message?:string;distance?:number}
export function getFloorPorts(building:Building,floor:Floor):FloorPort[]{
 const ports:FloorPort[]=[]
 for(const door of collectFloorDoors({...floor,rooms:floor.rooms??[]})){
  const wall=floor.walls?.find(w=>w.id===door.wallAttachment?.wallId)
  const physical=door.wallAttachment&&wall?deriveAttachedDoor(door,wall):door
  const own=door.wallAttachment?undefined:ownWallOf(door,floor)
  ports.push({key:`door:${door.id}`,kind:'door',id:door.id,label:door.name??'Door',position:{...physical.position},hostWallId:door.wallAttachment?.wallId,connection:door.routeConnection,...(door.wallAttachment&&!wall?{issue:'Host wall is missing.'}:{}),...(own?{ownWallId:own.id,ownWallReach:own.reach}:{})})
 }
 for(const entrance of floor.entrances??[]){
  const nodeId=entrance.routeNodeId??floor.entranceAccess?.find(a=>a.entranceId===entrance.id)?.indoorRouteNodeId
  ports.push({key:`entrance:${entrance.id}`,kind:'entrance',id:entrance.id,label:entrance.label??'Entrance',position:{...entrance.position},connection:entrance.routeConnection,manualConnected:!entrance.routeConnection&&!!nodeId&&!!floor.routeNetwork?.edges.some(e=>e.from===nodeId||e.to===nodeId)})
 }
 for(const [kind,features] of [['stair',building.staircases??[]],['elevator',building.elevators??[]]] as const){
  for(const feature of features){const geometry=feature.levels?.[floor.level];if(!geometry)continue
   ports.push({key:`${kind}:${feature.id}`,kind,id:feature.id,label:feature.name,position:{...(geometry.landing?.position??geometry.position)},connection:geometry.routeConnection})
  }
 }
 return ports
}
export function floorConnectionSignature(building:Building,floor:Floor):string {return JSON.stringify([floor.id,floor.level,floor.routeNetwork,floor.walls,floor.openings,getFloorPorts(building,floor)])}
export function projectFloorPoint(point:LocalCoord,a:LocalCoord,b:LocalCoord):LocalCoord {
 const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/den)):0
 return {x:a.x+t*dx,y:a.y+t*dy}
}
export function floorBackboneEdges(building:Building,floor:Floor){
 const owned=new Set(getFloorPorts(building,floor).flatMap(p=>p.connection?[p.connection.connectorEdgeId]:[]))
 return (floor.routeNetwork?.edges??[]).filter(e=>!owned.has(e.id))
}
export function floorConnectionProblem(port:FloorPort,target:LocalCoord,floor:Floor):string|undefined {
 if(port.issue)return port.issue
 if(![port.position.x,port.position.y,target.x,target.y].every(Number.isFinite))return 'Connection coordinates are invalid.'
 const p=port.position,r={x:target.x-p.x,y:target.y-p.y}
 for(const wall of floor.walls??[]){
  const a=wall.start,s={x:wall.end.x-a.x,y:wall.end.y-a.y},den=r.x*s.y-r.y*s.x
  if(Math.abs(den)<1e-9){
   const pa=projectFloorPoint(p,a,wall.end),pb=projectFloorPoint(target,a,wall.end)
   if(Math.hypot(pa.x-p.x,pa.y-p.y)<wall.thickness/2&&Math.hypot(pb.x-target.x,pb.y-target.y)<wall.thickness/2&&Math.hypot(r.x,r.y)>1e-6)return 'Connection runs inside a wall.'
   continue
  }
  const q={x:a.x-p.x,y:a.y-p.y},t=(q.x*s.y-q.y*s.x)/den,u=(q.x*r.y-q.y*r.x)/den
  if(t < -1e-7||t>1+1e-7||u < -1e-7||u>1+1e-7)continue
  if(t<=1e-6&&(port.hostWallId===wall.id||port.kind==='entrance'))continue
  if(port.ownWallId===wall.id&&t*Math.hypot(r.x,r.y)<=port.ownWallReach!)continue
  return 'Connection crosses a wall. Choose an accessible route segment.'
 }
}
export function nearestFloorTarget(building:Building,floor:Floor,position:LocalCoord):FloorConnectionTarget|undefined {
 const network=floor.routeNetwork;if(!network)return
 let best:{target:FloorConnectionTarget;distance:number}|undefined
 for(const edge of floorBackboneEdges(building,floor)){
  const a=network.nodes.find(n=>n.id===edge.from),b=network.nodes.find(n=>n.id===edge.to);if(!a||!b)continue
  const projected=projectFloorPoint(position,a.position,b.position),distance=Math.hypot(projected.x-position.x,projected.y-position.y)
  if(!best||distance<best.distance)best={target:{edgeId:edge.id,position:projected},distance}
 }
 return best?.target
}
export function suggestFloorConnections(building:Building,floor:Floor):FloorConnectionProposal[]{
 const network=floor.routeNetwork
 return getFloorPorts(building,floor).map(port=>{
  if(port.manualConnected)return {portKey:port.key,accepted:false,existing:true,message:'Connected by a drawn route. Edit its route points directly.'}
  const candidates=floorBackboneEdges(building,floor).flatMap(edge=>{
   const a=network?.nodes.find(n=>n.id===edge.from),b=network?.nodes.find(n=>n.id===edge.to);if(!a||!b)return []
   const position=projectFloorPoint(port.position,a.position,b.position)
   return [{target:{edgeId:edge.id,position},distance:Math.hypot(position.x-port.position.x,position.y-port.position.y),problem:floorConnectionProblem(port,position,floor)}]
  }).sort((a,b)=>a.distance-b.distance||a.target.edgeId.localeCompare(b.target.edgeId))
  if(port.connection){
   const target=network?.nodes.find(n=>n.id===port.connection!.targetRouteNodeId)
   const edge=target&&floorBackboneEdges(building,floor).find(e=>e.from===target.id||e.to===target.id)
   return {portKey:port.key,accepted:false,existing:true,...(target&&edge?{target:{edgeId:edge.id,position:{...target.position}}}:{}),message:'Existing connection preserved. Enable Edit to change it.'}
  }
  const best=candidates.find(c=>!c.problem&&c.distance<=12)??candidates[0]
  if(!best)return {portKey:port.key,accepted:false,message:'Draw a main floor route before connecting this item.'}
  const message=best.problem??(best.distance>12?'Long connection: review its path.':!floor.walls?.length?'Wall geometry is unavailable: review this connection.':undefined)
  return {portKey:port.key,target:best.target,distance:best.distance,accepted:!message,message}
 })
}
