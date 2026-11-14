import {expect,it} from 'vitest'
import {connectPrimitives} from '../primitives/connector'
const p={lat:12,lng:122}
function fixture(){return {nodes:[{id:'stair-stop',kind:'transition',floor:0,buildingId:'b',position:p,connectorId:'s',behavior:'stairs',accessible:false,source:{entityId:'s'}},{id:'near',kind:'waypoint',floor:0,buildingId:'b',position:p,source:{entityId:'near'}},{id:'R-authored',kind:'waypoint',floor:0,buildingId:'b',position:{lat:12,lng:122.00001},source:{entityId:'authored'}}],edges:[],metadata:{},diagnostics:[]} as any}
it('honors authored stair access instead of a nearer arbitrary route point',()=>{
 const result=connectPrimitives(fixture(),[],new Map(),50,undefined,undefined,{features:new Map([[JSON.stringify(['b',0,'s']),'R-authored']]),doors:new Map()})
 expect(result.edges.find((e:any)=>e.from==='stair-stop'&&e.kind==='access')).toMatchObject({to:'R-authored'})
})
it('does not fall back to a nearest point after explicit disconnect or a missing authored anchor',()=>{
 for(const target of [null,'R-missing']){
  const result=connectPrimitives(fixture(),[],new Map(),50,undefined,undefined,{features:new Map([[JSON.stringify(['b',0,'s']),target]]),doors:new Map()})
  expect(result.edges.filter((e:any)=>e.from==='stair-stop'&&e.kind==='access')).toHaveLength(0)
 }
})
