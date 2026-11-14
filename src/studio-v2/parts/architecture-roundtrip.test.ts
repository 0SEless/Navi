import { describe, expect, it } from 'vitest'
import { serializeDocument, deserializeDocument } from '@navi/core'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import { splitDocument } from './split'
import { joinParts } from './join'
describe('architecture persistence',()=>{
 it('preserves wall dimensions, canonical windows and attached-door identity through serialization and parts',()=>{
  const doc=fixtureFull(),floor=doc.buildings[0].floors[0]
  floor.walls=[{id:'host',start:{x:0,y:0},end:{x:10,y:0},height:3.5,thickness:0.15}]
  floor.openings=[undefined,'open','fixed','two-pane'].map((windowAppearance,index)=>({id:`window-${index}`,type:'window' as const,wallId:'host',offset:index*2,width:1.2,height:1.2,sillHeight:0.9,...(windowAppearance!==undefined?{windowAppearance:windowAppearance as 'open'|'fixed'|'two-pane'}:{})}))
  floor.doors=[{id:'door',position:{x:2,y:0},width:1,depth:0.15,rotation:0,doorType:'standard',metadata:{},wallAttachment:{wallId:'host',offset:2,openingHeight:2.1},routeConnection:{anchorNodeId:'anchor',targetRouteNodeId:'target',connectorEdgeId:'connector'}}]
  const serialized=deserializeDocument(serializeDocument(doc))
  const joined=joinParts(splitDocument(serialized).parts).buildings[0].floors[0]
  expect(joined.walls).toEqual(floor.walls);expect(joined.openings).toEqual(floor.openings);expect(joined.doors).toEqual(floor.doors)
  expect(Object.hasOwn(joined.openings![0],'windowAppearance')).toBe(false)
 })
 it('retains absent attachment fields on legacy doors',()=>{
  const doc=fixtureFull(),floor=doc.buildings[0].floors[0]
  floor.doors=[{id:'legacy',position:{x:2,y:0},width:1,doorType:'standard',metadata:{}}]
  const joined=joinParts(splitDocument(deserializeDocument(serializeDocument(doc))).parts).buildings[0].floors[0]
  expect(Object.hasOwn(joined.doors![0],'wallAttachment')).toBe(false)
 })
})
