import {collectFloorDoors} from '@navi/core'
import {isRouteNodeReferencedByAccessRelationships} from './routing-relationship-cleanup'
import { recordChange } from '@navi/core'
import type { Building, CampusDocument, Floor } from '@navi/core'
import type { CommandHandler, MutationResult } from './types'
import { entranceAccessAssignHandler } from './route-access-handlers'
import { floorBackboneEdges, floorConnectionProblem, floorConnectionSignature, getFloorPorts, projectFloorPoint, type FloorConnectionProposal } from '../geometry/floor-connections'
import { applyRouteJunctionSplit } from './route-junctions'
import { genId } from '../id'
import { routePathCreateHandler } from './route-network-handlers'

const fields=['routeNetwork','entrances','entranceAccess','doors','rooms'] as const
function levelOwners(building:Building,floor:Floor){return [...(building.staircases??[]),...(building.elevators??[])].flatMap(feature=>{const level=feature.levels?.[floor.level];return level?[{id:feature.id,level}]:[]})}
function snapshot(floor:Floor,building:Building) {return {
 fields:Object.fromEntries(fields.map(key=>[key,{present:Object.hasOwn(floor,key),value:structuredClone(floor[key])}])),
 levels:levelOwners(building,floor).map(({id,level})=>({id,connectionPresent:Object.hasOwn(level,'routeConnection'),connection:structuredClone(level.routeConnection),managedPresent:Object.hasOwn(level,'routeConnectionManaged'),managed:level.routeConnectionManaged})),
}}
function restore(floor:Floor,state:ReturnType<typeof snapshot>,building:Building) {
 for(const key of fields){if(state.fields[key].present)Object.assign(floor,{[key]:structuredClone(state.fields[key].value)});else delete (floor as unknown as Record<string,unknown>)[key]}
 for(const item of state.levels){const owner=levelOwners(building,floor).find(p=>p.id===item.id)?.level;if(!owner)continue
  if(item.connectionPresent)owner.routeConnection=structuredClone(item.connection);else delete owner.routeConnection
  if(item.managedPresent)owner.routeConnectionManaged=item.managed;else delete owner.routeConnectionManaged
 }
}
/** A real terminal at the entrance, with no fabricated corridor edge. */
export function ensureEntranceRoutePort(floor:Floor,entranceId:string):string {
  const entrance=floor.entrances.find(e=>e.id===entranceId)
  if(!entrance)throw new Error(`Entrance not found: ${entranceId}`)
  const existing=entrance.routeNodeId ?? floor.entranceAccess?.find(a=>a.entranceId===entranceId)?.indoorRouteNodeId
  if(existing){
    if(!floor.routeNetwork?.nodes.some(n=>n.id===existing))throw new Error('The entrance references a missing route point; repair it before connecting.')
    entrance.routeNodeId=existing;return existing
  }
  if(![entrance.position.x,entrance.position.y].every(Number.isFinite))throw new Error('Entrance position must be finite.')
  const id=`route-node-entrance-${entranceId}`
  const network=floor.routeNetwork??={nodes:[],edges:[]}
  if(network.nodes.some(n=>n.id===id))throw new Error('The entrance route-point identity is already in use.')
  network.nodes.push({id,type:'entrance',position:{...entrance.position},floor:floor.level})
  entrance.routeNodeId=id
  return id
}
function mutate(document:CampusDocument,payload:Record<string,unknown>,operation:(draft:CampusDocument,floor:Floor)=>MutationResult):MutationResult {
  const buildingId=payload.buildingId as string,floorId=payload.floorId as string
  const building=document.buildings.find(b=>b.id===buildingId)
  const floor=building?.floors.find(f=>f.id===floorId)
  if(!floor||!building)return {success:false,error:'The selected floor no longer exists.'}
  const before=snapshot(floor,building)
  if(payload.restore){restore(floor,payload.restore as ReturnType<typeof snapshot>,building)}
  else {
    const draft=structuredClone(document),draftFloor=draft.buildings.find(b=>b.id===buildingId)!.floors.find(f=>f.id===floorId)!
    try {
      const result=operation(draft,draftFloor)
      if(!result.success)return result
      restore(floor,snapshot(draftFloor,draft.buildings.find(b=>b.id===buildingId)!),building)
      recordChange(document,{entityId:floorId,entityType:'route-network',operation:'updated'})
      return {...result,data:{...result.data,buildingId,floorId,before,after:snapshot(floor,building)}}
    }catch(error){return {success:false,error:(error as Error).message}}
  }
  recordChange(document,{entityId:floorId,entityType:'route-network',operation:'updated'})
  return {success:true,entityId:floorId,data:{buildingId,floorId,before}}
}
const inverse=(id:string,payload:Record<string,unknown>,result:MutationResult)=>result.success&&result.data?.before?{id,label:'Undo floor connection',payload:{buildingId:payload.buildingId,floorId:payload.floorId,restore:result.data.before}}:null

const redo=(id:string,payload:Record<string,unknown>,result:MutationResult)=>result.success&&result.data?.after?{id,label:'Redo floor connection',payload:{buildingId:payload.buildingId,floorId:payload.floorId,restore:result.data.after}}:null

export const entranceOutdoorConnectHandler:CommandHandler={
  id:'entrance.outdoor.connect',
  execute:(document,payload)=>mutate(document,payload,(draft,floor)=>{
    const indoorRouteNodeId=ensureEntranceRoutePort(floor,payload.entranceId as string)
    return entranceAccessAssignHandler.execute(draft,{...payload,indoorRouteNodeId})
  }),
  inverse:(payload,result)=>inverse('entrance.outdoor.connect',payload,result),
  redo:(payload,result)=>redo('entrance.outdoor.connect',payload,result),
}
export const floorRouteDrawHandler:CommandHandler={
  id:'floor.route.draw',
  execute:(document,payload)=>mutate(document,payload,(draft,floor)=>{
    if(!Array.isArray(payload.points))return {success:false,error:'Route points are required.'}
    const points=payload.points.map(point=>{
      if(!point||typeof point!=='object')throw new Error('Route points must be coordinates.')
      const p={...point}
      if(p.entranceId){p.existingNodeId=ensureEntranceRoutePort(floor,p.entranceId);const node=floor.routeNetwork!.nodes.find(n=>n.id===p.existingNodeId)!;p.x=node.position.x;p.y=node.position.y;delete p.entranceId}
      return p
    })
    return routePathCreateHandler.execute(draft,{...payload,points})
  }),
  inverse:(payload,result)=>inverse('floor.route.draw',payload,result),
  redo:(payload,result)=>redo('floor.route.draw',payload,result),
}

export const floorConnectionsApplyHandler:CommandHandler={
 id:'floor.connections.apply',
 execute:(document,payload)=>mutate(document,payload,(draft,floor)=>{
  const building=draft.buildings.find(b=>b.id===payload.buildingId)!
  if(payload.expectedSignature!==undefined&&payload.expectedSignature!==floorConnectionSignature(building,floor))return {success:false,error:'The floor changed after this preview. Cancel and generate suggestions again.'}
  if(!Array.isArray(payload.connections)||!payload.connections.length)return {success:false,error:'Select at least one connection.'}
  const originalNetwork=structuredClone(floor.routeNetwork),originalEdges=floorBackboneEdges(building,floor)
  const seen=new Set<string>()
  for(const row of payload.connections as FloorConnectionProposal[]){
   if(!row||typeof row.portKey!=='string'||seen.has(row.portKey))throw new Error('Connection identities must be unique.')
   seen.add(row.portKey)
   const port=getFloorPorts(building,floor).find(p=>p.key===row.portKey)
   if(!port)throw new Error('A connection item no longer exists on this floor.')
   const owner=port.kind==='door'?collectFloorDoors({...floor,rooms:floor.rooms??[]}).find(d=>d.id===port.id):port.kind==='entrance'?floor.entrances.find(e=>e.id===port.id):levelOwners(building,floor).find(p=>p.id===port.id)?.level
   if(!owner)throw new Error('The connection owner is missing.')
   const network=floor.routeNetwork
   if(!network)throw new Error('Draw a main floor route before connecting items.')
   let targetId:string|undefined
   if(!row.disconnect){
    if(!row.target||![row.target.position?.x,row.target.position?.y].every(Number.isFinite))throw new Error('Choose a valid route segment.')
    const original=originalEdges.find(e=>e.id===row.target!.edgeId),a=originalNetwork?.nodes.find(n=>n.id===original?.from),b=originalNetwork?.nodes.find(n=>n.id===original?.to)
    if(!original||!a||!b)throw new Error('The selected segment is not a main floor route.')
    const target=projectFloorPoint(row.target.position,a.position,b.position),problem=floorConnectionProblem(port,target,floor)
    if(problem)throw new Error(problem)
    const onLine=(p:{x:number;y:number})=>{const q=projectFloorPoint(p,a.position,b.position);return Math.hypot(q.x-p.x,q.y-p.y)<1e-6}
    const edge=floorBackboneEdges(building,floor).find(e=>{
     const from=network.nodes.find(n=>n.id===e.from),to=network.nodes.find(n=>n.id===e.to);if(!from||!to||!onLine(from.position)||!onLine(to.position))return false
     const q=projectFloorPoint(target,from.position,to.position);return Math.hypot(q.x-target.x,q.y-target.y)<1e-6
    })
    if(!edge)throw new Error('The selected segment changed while applying connections.')
    const split=applyRouteJunctionSplit(network,edge.id,target,floor.level);if(!split.ok)throw new Error(split.error);targetId=split.junctionId
   }
   const previous=owner.routeConnection
   if(previous)network.edges=network.edges.filter(e=>e.id!==previous.connectorEdgeId)
   owner.routeConnectionManaged=true
   if(row.disconnect){
    delete owner.routeConnection
    if(previous&&port.kind!=='entrance'&&!isRouteNodeReferencedByAccessRelationships(draft,building.id,floor.id,previous.anchorNodeId)&&!network.edges.some(e=>e.from===previous.anchorNodeId||e.to===previous.anchorNodeId))network.nodes=network.nodes.filter(n=>n.id!==previous.anchorNodeId)
    continue
   }
   let anchorId=previous?.anchorNodeId
   if(port.kind==='entrance')anchorId=ensureEntranceRoutePort(floor,port.id)
   if(!anchorId||!network.nodes.some(n=>n.id===anchorId)){
    anchorId=genId('route-node');network.nodes.push({id:anchorId,type:port.kind==='stair'||port.kind==='elevator'?'transition':'portal',position:{...port.position},floor:floor.level})
   }
   if(anchorId===targetId)throw new Error('An item cannot connect to its own access point.')
   const target=network.nodes.find(n=>n.id===targetId)!,connectorEdgeId=genId('route-edge')
   network.edges.push({id:connectorEdgeId,from:anchorId,to:target.id,type:'walk',distance:Math.hypot(target.position.x-port.position.x,target.position.y-port.position.y)})
   owner.routeConnection={anchorNodeId:anchorId,targetRouteNodeId:target.id,connectorEdgeId}
  }
  return {success:true,entityId:floor.id}
 }),
 inverse:(payload,result)=>inverse('floor.connections.apply',payload,result),
  redo:(payload,result)=>redo('floor.connections.apply',payload,result),
}
