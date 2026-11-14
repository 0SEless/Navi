import type { LocalCoord, Wall } from '@navi/core'
import type { Tool, ToolContext, ToolPointerEvent } from './types'
import type { RectanglePlacementState } from './rectangle-placement-tool'
import { findPlacementWall, projectWallDoorRectangle } from '../geometry/door-placement'
export type { RectanglePlacementState as DoorToolState } from './rectangle-placement-tool'

/** Wall-bound click-drag authoring. Existing standalone doors are not migrated. */
export class DoorTool implements Tool {
  readonly id='door'
  readonly label='Door'
  readonly cursor='crosshair'
  message:string|null=null
  private draft:{start:LocalCoord;current:LocalCoord;wall:Wall;buildingId:string;floorId:string}|null=null
  get state():RectanglePlacementState {return {phase:this.draft?'dragging':'idle',start:this.draft?{...this.draft.start}:null,current:this.draft?{...this.draft.current}:null,placed:false}}
  get preview():LocalCoord[]|null {if(!this.draft)return null;const result=projectWallDoorRectangle(this.draft.wall,this.draft.start,this.draft.current);return result.ok?result.rectangle.points:null}
  onActivate():void {this.draft=null;this.message='Start on a wall and drag along it to size a door.'}
  onDeactivate():void {this.draft=null;this.message=null}
  onPointerDown(event:ToolPointerEvent,ctx:ToolContext):void {
    if(event.button!==0||this.draft)return
    const buildingId=ctx.services.viewport?.activeBuildingId,floorId=ctx.services.viewport?.activeFloorId
    const floor=ctx.document?.buildings.find(building=>building.id===buildingId)?.floors.find(candidate=>candidate.id===floorId)
    if(!floor||!buildingId||!floorId){this.message='No active floor is available.';return}
    const start={x:event.x,y:event.y},host=findPlacementWall(floor.walls??[],start)
    if(!host.ok){this.message=host.reason;return}
    this.draft={start,current:start,wall:host.wall,buildingId,floorId};this.message='Drag along the highlighted wall, then release to place the door.'
  }
  onPointerMove(event:ToolPointerEvent,_ctx:ToolContext):void {void _ctx;if(this.draft)this.draft.current={x:event.x,y:event.y}}
  onPointerUp(event:ToolPointerEvent,ctx:ToolContext):void {
    const draft=this.draft;this.draft=null;if(!draft)return
    if(ctx.services.viewport?.activeBuildingId!==draft.buildingId||ctx.services.viewport?.activeFloorId!==draft.floorId){this.message='Door placement cancelled because the active floor changed.';return}
    const wall=ctx.document?.buildings.find(building=>building.id===draft.buildingId)?.floors.find(floor=>floor.id===draft.floorId)?.walls?.find(candidate=>candidate.id===draft.wall.id)
    if(!wall||JSON.stringify(wall)!==JSON.stringify(draft.wall)){this.message='The host wall changed. Start door placement again.';return}
    const result=projectWallDoorRectangle(draft.wall,draft.start,{x:event.x,y:event.y})
    if(!result.ok){this.message=result.reason;return}
    const rectangle=result.rectangle
    const commandResult=ctx.services.dispatcher.execute({id:'door.create',label:'Create Door',payload:{buildingId:draft.buildingId,floorId:draft.floorId,door:{name:'Door',doorType:'standard',position:rectangle.center,width:rectangle.width,depth:rectangle.depth,rotation:rectangle.rotation,wallAttachment:rectangle.wallAttachment,geometry:{type:'rectangle',min:rectangle.min,max:rectangle.max,rotation:rectangle.rotation},metadata:{}}}})
    this.message=commandResult?.success===false?commandResult.error||'Door placement was refused.':'Door created. Drag on a wall to place another.'
  }
  onKeyDown(event:KeyboardEvent,_ctx:ToolContext):void {void _ctx;if(event.key==='Escape'){this.draft=null;this.message='Door placement cancelled.'}}
}
