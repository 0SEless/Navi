import { describe, it, expect } from 'vitest'
import type { Floor, Staircase } from '@navi/core'
import { buildFloorArchitecturePreview } from '../floor-architecture-preview'
describe('floor architecture preview boundary', () => {
  it('uses the stair rise override instead of floor height', () => {
    const floor={id:'f',level:0,height:3.5,rooms:[]} as unknown as Floor
    const stairs=[{id:'s',levels:{0:{position:{x:0,y:0},rotation:0,height:1.8,polygon:{points:[{x:0,y:0},{x:2,y:0},{x:2,y:3},{x:0,y:3}]}}}}] as unknown as Staircase[]
    const preview=buildFloorArchitecturePreview(floor,'b',{buildingLocalToWorld:p=>({lng:p.x,lat:p.y})},stairs)
    expect(Math.max(...preview.stairs.features.map(f=>f.properties!.height))).toBeCloseTo(1.8)
  })
  it('shares door and stair visuals while retaining local canonical selection IDs', () => {
    const floor={id:'f',level:0,height:3.5,rooms:[],doors:[{id:'door',position:{x:2,y:0},width:1,doorType:'standard',doorAppearance:'glass',wallAttachment:{wallId:'w',offset:2,openingHeight:2.1},metadata:{}}],walls:[{id:'w',start:{x:0,y:0},end:{x:6,y:0},height:3.5,thickness:.2}]} as unknown as Floor
    const stairs:Staircase[]=[{id:'stair',buildingId:'b',name:'Stair',type:'open',accessible:false,fromLevel:0,toLevel:0,levels:{0:{position:{x:4,y:4},rotation:0,drawing:{definitionId:'stair',properties:{stepCount:6,stepWidth:1,stepDepth:.2,direction:'south',preset:'straight'}}}}}]
    const preview=buildFloorArchitecturePreview(floor,'b',{buildingLocalToWorld:p=>({lng:120+p.x*.001,lat:12+p.y*.001})},stairs)
    expect(preview.stairs.features).toHaveLength(6);expect(preview.glass.features).toHaveLength(1)
    expect(preview.selectionVolumes.features.some(f=>f.properties?.doorId==='door')).toBe(true)
    expect(preview.selectionVolumes.features.some(f=>f.properties?.featureId==='stair')).toBe(true)
  })
  it('transforms frames and glass exactly once at the active floor datum', () => {
    const floor = { level: 7, elevation: 24, walls: [{ id:'w',start:{x:0,y:0},end:{x:6,y:0},thickness:.2,height:3.5 }], openings: [{id:'o',type:'window',wallId:'w',offset:1,width:2,sillHeight:1,height:1,windowAppearance:'two-pane'}], rooms:[],doors:[] } as unknown as Floor
    const preview=buildFloorArchitecturePreview(floor,'b',{buildingLocalToWorld:p=>({lng:120+p.x*.001,lat:12+p.y*.001})})
    expect(preview.frames.features).toHaveLength(5)
    expect(preview.glass.features).toHaveLength(2)
    expect(preview.frames.features.every(f=>f.properties?.openingId==='o'&&f.properties.base>=1&&f.properties.height<=2)).toBe(true)
    expect((preview.glass.features[0].geometry as GeoJSON.Polygon).coordinates[0][0][0]).toBeGreaterThan(120)
  })
  it('uses actual wall and window data to produce sill and header at active-floor datum', () => {
    const floor = { level: 2, elevation: 7, walls: [{ id: 'wall', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 3.5 }], openings: [{ id: 'window', type: 'window', wallId: 'wall', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }], rooms: [], doors: [] } as unknown as Floor
    const before = JSON.stringify(floor)
    const transform = { buildingLocalToWorld: (p: { x: number; y: number }) => ({ lat: p.y * 0.001, lng: p.x * 0.001 }) }
    const preview = buildFloorArchitecturePreview(floor, 'building', transform)
    expect(preview.diagnostics).toEqual([])
    const pieces = preview.collection.features.map(feature => feature.properties!)
    expect(pieces.some(piece => piece.base === 0 && piece.height === 0.9)).toBe(true)
    expect(pieces.some(piece => Math.abs(piece.base - 2.1) < 1e-8 && piece.height === 3.5)).toBe(true)
    expect(pieces.every(piece => piece.base < piece.height && piece.height <= 3.5)).toBe(true)
    expect(JSON.stringify(floor)).toBe(before)
  })
  it('omits untransformable polygons and explains the missing coordinates', () => {
    const floor = { walls: [{ id: 'wall', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 3.5 }], rooms: [], doors: [] } as unknown as Floor
    const preview = buildFloorArchitecturePreview(floor, 'building', { buildingLocalToWorld: () => null })
    expect(preview.collection.features).toEqual([])
    expect(preview.diagnostics.length).toBeGreaterThan(0)
  })
})
