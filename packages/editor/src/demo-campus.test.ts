import { describe, it, expect } from 'vitest'
import { getDemoCampus } from './demo-campus'

describe('ASU-Ibajay Demo Campus', () => {
  it('builds a valid CampusDocument', () => {
    const campus = getDemoCampus()
    expect(campus.schemaVersion).toBe(1)
    expect(campus.metadata.name).toBe('ASU-Ibajay Campus')
  })

  it('has 3 buildings', () => {
    const campus = getDemoCampus()
    expect(campus.buildings).toHaveLength(3)
  })

  it('has Main Building with 2 floors', () => {
    const campus = getDemoCampus()
    const main = campus.buildings.find(b => b.id === 'bld-main')
    expect(main).toBeDefined()
    expect(main!.floors).toHaveLength(2)
    expect(main!.floors[0].rooms.length).toBeGreaterThan(0)
    expect(main!.floors[0].hallways.length).toBeGreaterThan(0)
  })

  it('has Engineering Building', () => {
    const campus = getDemoCampus()
    const eng = campus.buildings.find(b => b.id === 'bld-eng')
    expect(eng).toBeDefined()
    expect(eng!.floors[0].staircases.length).toBeGreaterThan(0)
  })

  it('has Library Building', () => {
    const campus = getDemoCampus()
    const lib = campus.buildings.find(b => b.id === 'bld-lib')
    expect(lib).toBeDefined()
    expect(lib!.floors[0].entrances.length).toBe(1)
  })

  it('has 4 roads', () => {
    const campus = getDemoCampus()
    expect(campus.roads).toHaveLength(4)
  })

  it('has 2 panoramas', () => {
    const campus = getDemoCampus()
    expect(campus.panoramas).toHaveLength(2)
  })

  it('has 5 QR checkpoints', () => {
    const campus = getDemoCampus()
    expect(campus.qrCheckpoints).toHaveLength(5)
  })

  it('has all unique IDs', () => {
    const campus = getDemoCampus()
    const ids = new Set<string>()
    const dupes: string[] = []

    function check(id: string) {
      if (ids.has(id)) dupes.push(id)
      ids.add(id)
    }

    for (const b of campus.buildings) {
      check(b.id)
      for (const f of b.floors) {
        check(f.id)
        for (const r of f.rooms) check(r.id)
        for (const h of f.hallways) check(h.id)
        for (const s of f.staircases) check(s.id)
        for (const e of f.elevators) check(e.id)
        for (const e of f.entrances) check(e.id)
      }
    }
    for (const r of campus.roads) check(r.id)
    for (const p of campus.panoramas) check(p.id)
    for (const q of campus.qrCheckpoints) check(q.id)

    expect(dupes).toHaveLength(0)
  })

  it('footprints are closed polygons', () => {
    const campus = getDemoCampus()
    for (const b of campus.buildings) {
      const pts = b.footprint.points
      expect(pts[0].lat).toBe(pts[pts.length - 1].lat)
      expect(pts[0].lng).toBe(pts[pts.length - 1].lng)
    }
  })

  it('rooms have closed polygons', () => {
    const campus = getDemoCampus()
    for (const b of campus.buildings) {
      for (const f of b.floors) {
        for (const r of f.rooms) {
          const pts = r.polygon.points
          expect(pts[0].x).toBe(pts[pts.length - 1].x)
          expect(pts[0].y).toBe(pts[pts.length - 1].y)
        }
      }
    }
  })

  it('every building has a main entrance', () => {
    const campus = getDemoCampus()
    for (const b of campus.buildings) {
      const hasMain = b.floors.some(f => f.entrances.some(e => e.type === 'main'))
      expect(hasMain).toBe(true)
    }
  })

  it('caches result (same reference on second call)', () => {
    const a = getDemoCampus()
    const b = getDemoCampus()
    expect(a).toBe(b)
  })
})
