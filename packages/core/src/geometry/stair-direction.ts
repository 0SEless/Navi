/** Flight corners: the first edge is the low end, the opposite edge the high end.
 * Freeform footprints keep their authored vertex order. Parametric rectangles
 * use polygonizeRect's (+x,+y), (-x,+y), (-x,-y), (+x,-y) corner order before rotation.
 */
export function resolveStairDirectionCorners(direction?: string): readonly [number, number, number, number] | undefined {
  switch (direction) {
    case undefined:
    case 'north':
    case 'down': return [0, 1, 2, 3]
    case 'south':
    case 'up': return [2, 3, 0, 1]
    case 'east': return [1, 2, 3, 0]
    case 'west': return [3, 0, 1, 2]
    default: return undefined
  }
}
