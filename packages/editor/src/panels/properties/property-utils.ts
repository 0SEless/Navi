import type { CampusDocument } from '@navi/core'

export interface EntityLookupResult {
  entity: Record<string, any>
  path: string
}

export function findEntityById(doc: CampusDocument, id: string): EntityLookupResult | null {
  for (const bld of doc.buildings) {
    if (bld.id === id) return { entity: bld as any, path: 'building' }
    for (const flr of bld.floors) {
      if (flr.id === id) return { entity: flr as any, path: 'floor' }
      for (const rm of flr.rooms) {
        if (rm.id === id) return { entity: rm as any, path: 'room' }
      }
      for (const hw of flr.hallways) {
        if (hw.id === id) return { entity: hw as any, path: 'hallway' }
      }
      for (const st of flr.staircases) {
        if (st.id === id) return { entity: st as any, path: 'staircase' }
      }
      for (const el of flr.elevators) {
        if (el.id === id) return { entity: el as any, path: 'elevator' }
      }
      for (const ent of flr.entrances) {
        if (ent.id === id) return { entity: ent as any, path: 'entrance' }
      }
    }
  }
  for (const rd of doc.roads) {
    if (rd.id === id) return { entity: rd as any, path: 'road' }
  }
  for (const pan of doc.panoramas) {
    if (pan.id === id) return { entity: pan as any, path: 'panorama' }
  }
  for (const qr of doc.qrCheckpoints) {
    if (qr.id === id) return { entity: qr as any, path: 'qr' }
  }
  return null
}


