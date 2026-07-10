import type { CampusDocument, LatLng, LocalCoord } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

function segmentsIntersect(
  a1: { x: number; y: number }, a2: { x: number; y: number },
  b1: { x: number; y: number }, b2: { x: number; y: number },
): boolean {
  const denom = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(denom) < 1e-12) return false

  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / denom
  const u = -((a1.x - a2.x) * (a1.y - b1.y) - (a1.y - a2.y) * (a1.x - b1.x)) / denom

  return t > 0 && t < 1 && u > 0 && u < 1
}

function latLngToPoint(p: LatLng): { x: number; y: number } {
  return { x: p.lng, y: p.lat }
}

function localToPoint(p: LocalCoord): { x: number; y: number } {
  return { x: p.x, y: p.y }
}

function checkSelfIntersection(
  points: { x: number; y: number }[],
  entityId: string,
  entityLabel: string,
  validatorId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        issues.push({
          severity: 'error',
          entityId,
          message: `${entityLabel} has self-intersecting edges`,
          validatorId,
        })
        return issues
      }
    }
  }
  return issues
}

export const selfIntersectionValidator: ValidatorPlugin = {
  id: 'self-intersection',
  label: 'Self-Intersection',
  scope: 'entity',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const bld of document.buildings) {
      issues.push(...checkSelfIntersection(
        bld.footprint.points.map(latLngToPoint),
        bld.id, `Building "${bld.name}"`, 'self-intersection',
      ))

      for (const floor of bld.floors) {
        for (const room of floor.rooms) {
          issues.push(...checkSelfIntersection(
            room.polygon.points.map(localToPoint),
            room.id, `Room "${room.name}"`, 'self-intersection',
          ))
        }
      }
    }

    return issues
  },
}
