import type { StairLevelGeometry, ElevatorLevelGeometry, LocalCoord } from '@navi/core'

type Geometry = StairLevelGeometry | ElevatorLevelGeometry

/** Strip closure only; retain corner order because it defines the freeform stair arrow. */
export function featureRectanglePoints(geometry: Geometry): LocalCoord[] | undefined {
  const points = geometry.polygon?.points
  if (!points) return
  const last = points[points.length - 1], first = points[0]
  const ring = points.length === 5 && last.x === first.x && last.y === first.y ? points.slice(0, -1) : points
  return ring.length === 4 && ring.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? ring : undefined
}

export function featureDimensions(geometry: Geometry): { width: number; depth: number } | undefined {
  const drawing = geometry.drawing
  if (drawing?.definitionId === 'stair') return { width: drawing.properties.stepWidth, depth: drawing.properties.stepCount * drawing.properties.stepDepth }
  if (drawing?.definitionId === 'elevator') return { width: drawing.properties.width, depth: drawing.properties.depth }
  const p = featureRectanglePoints(geometry)
  if (p) return { width: Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), depth: Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y) }
}

/** Resize from the source of truth, about its existing center, using canonical degrees. */
export function resizeFeatureGeometry(geometry: Geometry, width: number, depth: number, rotation: number): Geometry {
  if (![width, depth, rotation].every(Number.isFinite) || width <= 0 || depth <= 0) throw new Error('Width and depth must be positive finite meters; rotation must be finite degrees.')
  const next = structuredClone(geometry)
  next.rotation = rotation
  if (next.drawing?.definitionId === 'stair') {
    const props = next.drawing.properties
    if (!Number.isInteger(props.stepCount) || props.stepCount < 1 || props.stepCount > 128) throw new Error('Stair tread count must be between 1 and 128.')
    props.stepWidth = width
    props.stepDepth = depth / props.stepCount
  } else if (next.drawing?.definitionId === 'elevator') {
    next.drawing.properties.width = width
    next.drawing.properties.depth = depth
  } else {
    const p = featureRectanglePoints(geometry), size = featureDimensions(geometry)
    if (!p || !size || size.width <= 0 || size.depth <= 0) throw new Error('This feature needs a rectangular footprint before it can be resized.')
    const u = { x: (p[1].x-p[0].x)/size.width, y: (p[1].y-p[0].y)/size.width }
    const v = { x: (p[2].x-p[1].x)/size.depth, y: (p[2].y-p[1].y)/size.depth }
    const center = { x: p.reduce((s,q)=>s+q.x,0)/4, y: p.reduce((s,q)=>s+q.y,0)/4 }
    if (Math.abs(u.x*v.x+u.y*v.y)>1e-6 || Math.hypot(p[3].x-(p[0].x+p[2].x-p[1].x),p[3].y-(p[0].y+p[2].y-p[1].y))>1e-6) throw new Error('Only rectangular feature footprints can be resized numerically.')
    const angle=(rotation-geometry.rotation)*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle)
    const points = p.map(q=>{
      const dx=q.x-center.x,dy=q.y-center.y
      const a=(dx*u.x+dy*u.y)*width/size.width, b=(dx*v.x+dy*v.y)*depth/size.depth
      const x=a*u.x+b*v.x, y=a*u.y+b*v.y
      return {x:center.x+x*cos-y*sin,y:center.y+x*sin+y*cos}
    })
    if (geometry.polygon!.points.length===5) points.push({...points[0]})
    next.polygon={...geometry.polygon!,points}
  }
  return next
}
