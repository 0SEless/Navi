import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '@navi/core'
import { projectDoorToWall, prepareWallAttachmentUpdate, applyWallAttachmentState } from '../door-wall-attachment'
const wall: Wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3.5, thickness: 0.15 }
function fixture(): Floor {
  return { id: 'f', level: 0, label: 'GF', elevation: 0, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {}, walls: [structuredClone(wall)],
    doors: [{ id: 'd', roomId: 'owner', ownership: { status: 'assigned' }, doorType: 'standard', position: { x: 3, y: 0 }, width: 1, depth: 0.2, rotation: 0, metadata: {}, wallAttachment: { wallId: 'w', offset: 3, openingHeight: 2.1 }, routeConnection: { anchorNodeId: 'a', targetRouteNodeId: 't', connectorEdgeId: 'e' } }],
    routeNetwork: { nodes: [{ id: 'a', type: 'portal', position: { x: 3, y: 0 }, floor: 0 }, { id: 't', type: 'waypoint', position: { x: 3, y: 5 }, floor: 0 }], edges: [{ id: 'e', from: 'a', to: 't', type: 'walk', distance: 5 }] } } as Floor
}
describe('door wall projection', () => {
  it('aligns a dragged door center and tangent while retaining its along-wall width', () => {
    const result = projectDoorToWall(wall, { x: 2, y: 0.4 }, { x: 4, y: -0.5 }, 0.2)
    expect(result).toMatchObject({ ok: true, position: { x: 3, y: 0 }, width: 2, rotation: 0, attachment: { wallId: 'w', offset: 3, openingHeight: 2.1 } })
  })
  it('handles diagonal walls and reverse drags', () => {
    const diagonal = { ...wall, end: { x: 10, y: 10 } }
    const result = projectDoorToWall(diagonal, { x: 4, y: 4 }, { x: 2, y: 2 }, 0.2)
    expect(result.ok).toBe(true)
    if (result.ok) { expect(result.rotation).toBeCloseTo(Math.PI / 4); expect(result.width).toBeCloseTo(Math.sqrt(8)); expect(result.position.x).toBeCloseTo(3); expect(result.position.y).toBeCloseTo(3) }
  })
  it.each([[{ x: -1, y: 0 }, { x: 3, y: 0 }], [{ x: 2, y: 0 }, { x: 2.01, y: 0 }], [{ x: 9, y: 0 }, { x: 11, y: 0 }]])('refuses invalid or out-of-wall spans', (a,b) => {
    expect(projectDoorToWall(wall,a,b,0.2).ok).toBe(false)
  })
  it('refuses degenerate or nonfinite hosts and nonpositive depth', () => {
    expect(projectDoorToWall({ ...wall, end: wall.start }, {x:0,y:0},{x:1,y:0},0.2).ok).toBe(false)
    expect(projectDoorToWall(wall,{x:1,y:0},{x:2,y:0},0).ok).toBe(false)
  })
})
describe('attachment lifecycle preflight', () => {
  it('moves a wall attachment and its route anchor atomically without changing ownership or target', () => {
    const floor = fixture(); const before = JSON.stringify(floor)
    const next = [{ ...wall, start: { x: 0, y: 2 }, end: { x: 10, y: 2 } }]
    const result = prepareWallAttachmentUpdate(floor,next)
    expect(result.ok).toBe(true); expect(JSON.stringify(floor)).toBe(before)
    if (!result.ok) return
    applyWallAttachmentState(floor,result.state)
    expect(floor.doors![0]).toMatchObject({ roomId: 'owner', position: { x: 3, y: 2 }, wallAttachment: { wallId: 'w', offset: 3 } })
    expect(floor.routeNetwork!.nodes[0].position).toEqual({ x: 3, y: 2 })
    expect(floor.routeNetwork!.edges[0].distance).toBe(3)
    expect(floor.doors![0].routeConnection!.targetRouteNodeId).toBe('t')
    applyWallAttachmentState(floor,result.before)
    expect(JSON.stringify(floor)).toBe(before)
  })
  it('refuses deletion/shortening through a door and lowering through a window', () => {
    const floor = fixture()
    expect(prepareWallAttachmentUpdate(floor,[]).ok).toBe(false)
    expect(prepareWallAttachmentUpdate(floor,[{ ...wall,end:{x:3,y:0} }]).ok).toBe(false)
    floor.openings=[{id:'window',type:'window',wallId:'w',offset:5,width:1,sillHeight:0.9,height:1.2}]
    expect(prepareWallAttachmentUpdate(floor,[{...wall,height:1}]).ok).toBe(false)
  })
  it('remaps split attachments to the physical child and refuses a split through an aperture', () => {
    const floor=fixture(); const left={...wall,id:'left',end:{x:5,y:0}},right={...wall,id:'right',start:{x:5,y:0}}
    const result=prepareWallAttachmentUpdate(floor,[left,right],{w:['left','right']})
    expect(result.ok).toBe(true)
    if(result.ok)expect(result.state.doors![0].wallAttachment).toMatchObject({wallId:'left',offset:3})
    expect(prepareWallAttachmentUpdate(floor,[{...left,end:{x:3,y:0}},{...right,start:{x:3,y:0}}],{w:['left','right']}).ok).toBe(false)
  })
  it('remaps leading-edge opening offsets and centered doors when a merged host reverses', () => {
    const floor=fixture();floor.openings=[{id:'win',type:'window',wallId:'w',offset:5,width:1,height:1,sillHeight:1}]
    const result=prepareWallAttachmentUpdate(floor,[{...wall,id:'merged',start:{x:10,y:0},end:{x:0,y:0}}],{w:['merged']})
    expect(result.ok).toBe(true)
    if(result.ok){expect(result.state.doors![0].wallAttachment!.offset).toBe(7);expect(result.state.openings![0].offset).toBe(4)}
  })
  it('preserves absent optional collections on unrelated wall edits', () => {
    const floor=fixture();delete floor.doors;delete floor.routeNetwork
    const result=prepareWallAttachmentUpdate(floor,[{...wall,height:2}])
    expect(result.ok).toBe(true)
    if(result.ok){applyWallAttachmentState(floor,result.state);expect('doors' in floor).toBe(false);expect('routeNetwork' in floor).toBe(false);expect('openings' in floor).toBe(false)}
  })
})

describe('changed host overlap prevention',()=>{
 it('refuses merging apertures from overlapping wall spans without mutation',()=>{const floor=fixture();floor.walls!.push({...wall,id:'other'});floor.doors!.push({...structuredClone(floor.doors![0]),id:'second',wallAttachment:{wallId:'other',offset:3,openingHeight:2.1}});const before=JSON.stringify(floor);expect(prepareWallAttachmentUpdate(floor,[{...wall,id:'merged'}],{w:['merged'],other:['merged']}).ok).toBe(false);expect(JSON.stringify(floor)).toBe(before)})
 it('refuses a zero width canonical span on a changed host',()=>{const floor=fixture();floor.openings=[{id:'bad',type:'window',wallId:'w',offset:5,width:0}];expect(prepareWallAttachmentUpdate(floor,[{...wall,height:4}]).ok).toBe(false)})
})

describe('resolvable legacy windows',()=>{
 it('refuses wall edits through a resolvable legacy window but preserves composite references',()=>{const floor=fixture();floor.windows=[{id:'legacy',wallId:'w',offset:7,width:1,sillHeight:0.9,metadata:{}}];expect(prepareWallAttachmentUpdate(floor,[{...wall,height:1.5}]).ok).toBe(false);expect(prepareWallAttachmentUpdate(floor,[{...wall,end:{x:7.5,y:0}}]).ok).toBe(false);delete floor.doors;expect(prepareWallAttachmentUpdate(floor,[]).ok).toBe(false);floor.windows[0].wallId='room:old:0';expect(prepareWallAttachmentUpdate(floor,[]).ok).toBe(true)})
 it('remaps resolvable legacy windows and exactly restores their snapshot',()=>{const floor=fixture();floor.windows=[{id:'legacy',wallId:'w',offset:7,width:1,sillHeight:0.9,metadata:{tag:'retained'}}];const before=structuredClone(floor.windows);const result=prepareWallAttachmentUpdate(floor,[{...wall,id:'left',end:{x:5,y:0}},{...wall,id:'right',start:{x:5,y:0}}],{w:['left','right']});expect(result.ok).toBe(true);if(result.ok){applyWallAttachmentState(floor,result.state);expect(floor.windows![0]).toMatchObject({wallId:'right',offset:2});applyWallAttachmentState(floor,result.before);expect(floor.windows).toEqual(before)}})
})
