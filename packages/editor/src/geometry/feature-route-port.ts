import type {Building,Staircase,Elevator,Floor} from '@navi/core'
import {floorConnectionProblem,getFloorPorts} from './floor-connections'
export function syncFeatureRoutePort(building:Building,feature:Staircase|Elevator,level:number):string|undefined {
 const geometry=feature.levels[level],connection=geometry?.routeConnection;if(!connection)return
 const floor=building.floors.find(f=>f.level===level),network=floor?.routeNetwork
 const anchor=network?.nodes.find(n=>n.id===connection.anchorNodeId),target=network?.nodes.find(n=>n.id===connection.targetRouteNodeId)
 if(!floor||!network||!anchor||!target)return 'The floor access is broken. Reconnect this item before moving it.'
 const port=getFloorPorts(building,floor).find(p=>p.id===feature.id&&(p.kind==='stair'||p.kind==='elevator'))!
 const problem=floorConnectionProblem(port,target.position,floor);if(problem)return problem
 anchor.position={...port.position}
 for(const edge of network.edges){if(edge.from!==anchor.id&&edge.to!==anchor.id)continue
  const a=network.nodes.find(n=>n.id===edge.from),b=network.nodes.find(n=>n.id===edge.to);if(a&&b)edge.distance=Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)
 }
}
export function featureRouteNetworkSnapshot(building:Building,level:number){const floor=building.floors.find(f=>f.level===level);return floor?{present:Object.hasOwn(floor,'routeNetwork'),value:structuredClone(floor.routeNetwork)}:undefined}
export function restoreFeatureRouteNetwork(building:Building,level:number,state:ReturnType<typeof featureRouteNetworkSnapshot>){const floor=building.floors.find(f=>f.level===level);if(!floor||!state)return;if(state.present)floor.routeNetwork=structuredClone(state.value);else delete floor.routeNetwork}
export function removeFeatureRoutePort(floor:Floor,connection:NonNullable<Staircase['levels'][number]['routeConnection']>,building?:Building){
 const network=floor.routeNetwork;if(!network)return
 network.edges=network.edges.filter(e=>e.id!==connection.connectorEdgeId)
 if(!building?.verticalTransitions?.some(t=>t.connections.some(c=>c.floorId===floor.id&&c.routeNodeId===connection.anchorNodeId))&&!(building&&getFloorPorts(building,floor).some(p=>p.connection?.anchorNodeId===connection.anchorNodeId||p.connection?.targetRouteNodeId===connection.anchorNodeId))&&!network.edges.some(e=>e.from===connection.anchorNodeId||e.to===connection.anchorNodeId)&&!floor.entranceAccess?.some(a=>a.indoorRouteNodeId===connection.anchorNodeId)&&!floor.roomAttributes?.some(r=>r.accessPoints?.some(a=>a.routeNodeId===connection.anchorNodeId)))network.nodes=network.nodes.filter(n=>n.id!==connection.anchorNodeId)
}
