import { expect, it } from 'vitest'
import { serializeDocument, deserializeDocument } from '@navi/core'
import { CampusCompiler } from '../../../packages/compiler/src/pipeline/campus-compiler'
import { toRuntimeFloorGeometry } from '../../../packages/runtime/src/loader/runtime-converter'
import { fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { splitDocument } from './split'
import { joinParts } from './join'
import type { FloorGeometryFile } from '@navi/core'

it('retains appearance and stair construction through parts, compiler and runtime',()=>{
 const doc=fixtureMinimal(),b=doc.buildings[0],f=b.floors[0]
 doc.buildings=[b];doc.roads=[];b.floors=[f];f.rooms=[];f.hallways=[];f.entrances=[];f.connectorStops=[]
 f.height=3.5;f.walls=[{id:'wall',start:{x:0,y:0},end:{x:8,y:0},height:3.5,thickness:.2}]
 f.doors=[{id:'door',position:{x:2,y:0},width:1,doorType:'standard',doorAppearance:'double-glass',doorPose:'open',wallAttachment:{wallId:'wall',offset:2,openingHeight:2.1},metadata:{}}]
 f.openings=[{id:'opening',type:'door',wallId:'wall',offset:4,width:1,doorAppearance:'open',doorPose:'closed'}]
 b.staircases=[{id:'stair',buildingId:b.id,name:'Stair',type:'open',accessible:false,fromLevel:f.level,toLevel:f.level,levels:{[f.level]:{position:{x:3,y:3},rotation:25,drawing:{definitionId:'stair',properties:{stepCount:12,stepWidth:1.2,stepDepth:.25,direction:'south',preset:'straight'}},landing:{position:{x:3,y:3},polygon:{points:[{x:2,y:2},{x:4,y:2},{x:4,y:3},{x:2,y:3}]}}}}}]
 const joined=joinParts(splitDocument(deserializeDocument(serializeDocument(doc))).parts)
 expect(joined.buildings[0].floors[0].doors![0].doorAppearance).toBe('double-glass')
 const result=new CampusCompiler().compileV2(joined)
 expect(result.success,JSON.stringify(result)).toBe(true)
 const artifact=result.artifacts!.floorGeometry!,out=artifact.buildings[0].floors[0]
 expect(out.doors[0].doorAppearance).toBe('double-glass');expect(out.doors[0].doorPose).toBe('open');expect(out.openings![0].doorAppearance).toBe('open');expect(out.openings![0].doorPose).toBe('closed')
 expect(out.staircases[0]).toMatchObject({drawing:b.staircases[0].levels[f.level].drawing,landing:b.staircases[0].levels[f.level].landing,height:3.5})
 b.staircases[0].levels[f.level].height=2.4
 const overrideJoined=joinParts(splitDocument(deserializeDocument(serializeDocument(doc))).parts)
 expect(overrideJoined.buildings[0].staircases![0].levels[f.level].height).toBe(2.4)
 const override=new CampusCompiler().compileV2(overrideJoined)
 expect(override.success).toBe(true)
 expect(override.artifacts!.floorGeometry!.buildings[0].floors[0].staircases[0].height).toBe(2.4)
 const file=JSON.parse(JSON.stringify({...artifact,schemaVersion:String(artifact.schemaVersion)})) as FloorGeometryFile
 expect(toRuntimeFloorGeometry(file).buildings[0].floors[0]).toEqual(out)
})
